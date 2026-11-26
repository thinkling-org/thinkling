import { t } from './locale.ts'
// Wykrywanie i uruchamianie lokalnych CLI (Claude Code / Codex).
// Both CLIs use the user’s subscription.
import { spawn, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import type { ProviderId } from '../src/domain.ts'

interface ProviderCommand {
  cmd: string
  prefix: string[]
  path: string
  nodeScript?: boolean
}

interface AIRequest {
  provider?: ProviderId
  model?: string
  effort?: string
  binPath?: string
  system?: string
  prompt: string
  schema?: object
  onProgress?: (progress: { chars: number; partial: string }) => void
  signal?: AbortSignal
  timeoutMs?: number
}

interface AIResponse {
  data: unknown
  text: string
}

type ProviderRun = AIRequest & { cmd: ProviderCommand; timeoutMs: number }

const isWin = process.platform === 'win32'
const home = os.homedir()
const EXT_DIRS = ['.vscode', '.vscode-insiders', '.cursor', '.windsurf', '.vscode-oss'].map((d) =>
  path.join(home, d, 'extensions'),
)

const WORK_DIR = path.join(os.tmpdir(), 'thinkling-work')
fs.mkdirSync(WORK_DIR, { recursive: true })

function exists(p: string) {
  try {
    return !!p && fs.statSync(p).isFile()
  } catch {
    return false
  }
}

function which(name: string) {
  try {
    const out = execFileSync(isWin ? 'where' : 'which', isWin ? [name] : ['-a', name], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    })
    return out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
  } catch {
    return []
  }
}

/** Najnowsze (wg daty modyfikacji) dopasowania `<dir>/<prefix>*` + `rel`. */
function scanDirs(dirs: string[], prefix: string, relCandidates: string[][]) {
  const found = []
  for (const dir of dirs) {
    let entries = []
    try {
      entries = fs.readdirSync(dir).filter((n) => n.toLowerCase().startsWith(prefix))
    } catch {
      continue
    }
    for (const e of entries) {
      for (const rel of relCandidates) {
        const p = path.join(dir, e, ...rel)
        if (exists(p)) found.push(p)
      }
    }
  }
  return found.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
}

/**
 * Convert the binary path into a spawn command.
 * Resolve Windows npm shims (.cmd) to their JS entrypoints to avoid cmd.exe quoting issues.
 */
function toCommand(p: string, npmScripts: string[][]): ProviderCommand | null {
  if (!p) return null
  const lower = p.toLowerCase()
  if (lower.endsWith('.cmd') || lower.endsWith('.ps1') || (isWin && !path.extname(p))) {
    const base = path.dirname(p)
    for (const rel of npmScripts) {
      const js = path.join(base, 'node_modules', ...rel)
      if (exists(js)) return { cmd: process.execPath, prefix: [js], path: p, nodeScript: true }
    }
    if (isWin && !lower.endsWith('.exe')) return null
  }
  return exists(p) ? { cmd: p, prefix: [], path: p } : null
}

const PROVIDERS = {
  claude: {
    label: 'Claude',
    envVar: 'CLAUDE_BIN',
    npmScripts: [
      ['@anthropic-ai', 'claude-code', 'cli.js'],
      ['@anthropic-ai', 'claude-code', 'cli.mjs'],
    ],
    candidates() {
      const exe = isWin ? 'claude.exe' : 'claude'
      return [
        ...which('claude'),
        path.join(home, '.local', 'bin', exe),
        path.join(home, '.claude', 'local', exe),
        ...scanDirs(EXT_DIRS, 'anthropic.claude-code-', [['resources', 'native-binary', exe]]),
      ]
    },
  },
  codex: {
    label: 'Codex',
    envVar: 'CODEX_BIN',
    npmScripts: [['@openai', 'codex', 'bin', 'codex.js']],
    candidates() {
      const exe = isWin ? 'codex.exe' : 'codex'
      const list = [...which('codex'), path.join(home, '.local', 'bin', exe)]
      if (isWin && process.env.LOCALAPPDATA) {
        const binRoot = path.join(process.env.LOCALAPPDATA, 'OpenAI', 'Codex', 'bin')
        list.push(...scanDirs([binRoot], '', [[exe]]))
      }
      const plat = isWin ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux'
      for (const arch of ['x86_64', 'aarch64']) {
        list.push(...scanDirs(EXT_DIRS, 'openai.chatgpt-', [['bin', `${plat}-${arch}`, exe]]))
      }
      return list
    },
  },
}

const resolveCache = new Map()

function resolveProvider(id: ProviderId, overridePath?: string): ProviderCommand | null {
  const def = PROVIDERS[id]
  if (!def) throw new Error(t('Unknown provider: {0}', [id]))
  const key = `${id}|${overridePath || ''}`
  const cached = resolveCache.get(key)
  if (cached && Date.now() - cached.at < 60_000 && (!cached.cmd || exists(cached.cmd.path))) return cached.cmd
  const list = [overridePath, process.env[def.envVar], ...def.candidates()].filter(Boolean)
  let cmd = null
  for (const p of list) {
    cmd = toCommand(p, def.npmScripts)
    if (cmd) break
  }
  resolveCache.set(key, { at: Date.now(), cmd })
  return cmd
}

function cleanEnv(id: ProviderId, cmd: ProviderCommand) {
  const env = { ...process.env }
  if (cmd.nodeScript && process.versions.electron) env.ELECTRON_RUN_AS_NODE = '1'
  // Use the subscription login instead of API key billing.
  if (id === 'claude') {
    delete env.ANTHROPIC_API_KEY
    delete env.CLAUDECODE
    delete env.CLAUDE_CODE_ENTRYPOINT
  } else {
    delete env.OPENAI_API_KEY
  }
  return env
}

const versionCache = new Map()

export async function providerStatus(id: ProviderId, overridePath?: string) {
  const cmd = resolveProvider(id, overridePath)
  if (!cmd) return { id, label: PROVIDERS[id].label, available: false, path: null, version: null }
  let version = versionCache.get(cmd.path)
  if (!version) {
    try {
      version = execFileSync(cmd.cmd, [...cmd.prefix, '--version'], {
        encoding: 'utf8',
        timeout: 15_000,
        windowsHide: true,
        env: cleanEnv(id, cmd),
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
      versionCache.set(cmd.path, version)
    } catch {
      version = null
    }
  }
  return { id, label: PROVIDERS[id].label, available: !!version, path: cmd.path, version }
}

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const
type Effort = (typeof EFFORTS)[number]
const EFFORT_LABELS: Record<Effort, string> = { low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Very high', max: 'Maximum' }

function isEffort(value?: string): value is Effort {
  return EFFORTS.some((effort) => effort === value)
}

function safeEffort(effort?: string) {
  return isEffort(effort) ? effort : ''
}

function runQuiet(cmd: ProviderCommand, args: string[], id: ProviderId, timeout = 20_000) {
  return new Promise<{ code: number | null; out: string; err: string }>((resolve) => {
    const child = spawn(cmd.cmd, [...cmd.prefix, ...args], { env: cleanEnv(id, cmd), windowsHide: true, cwd: WORK_DIR })
    let out = ''
    let err = ''
    const timer = setTimeout(() => child.kill(), timeout)
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (err += d))
    child.on('error', () => resolve({ code: -1, out, err }))
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, out, err })
    })
    child.stdin.end()
  })
}

const authCache = new Map()

/** Check the CLI subscription login. Older CLIs may return null when the status is unknown. */
export async function providerAuth(id: ProviderId, overridePath?: string) {
  const cmd = resolveProvider(id, overridePath)
  if (!cmd) return { loggedIn: false, method: null }
  const cached = authCache.get(cmd.path)
  if (cached && Date.now() - cached.at < 30_000) return cached.value
  let value
  if (id === 'claude') {
    const r = await runQuiet(cmd, ['auth', 'status', '--json'], id)
    try {
      const j = JSON.parse(r.out)
      value = { loggedIn: !!j.loggedIn, method: j.authMethod || null }
    } catch {
      value = { loggedIn: r.code === 0 ? null : false, method: null }
    }
  } else {
    const r = await runQuiet(cmd, ['login', 'status'], id)
    const text = `${r.out}\n${r.err}`
    value = { loggedIn: r.code === 0 && /logged in/i.test(text), method: /chatgpt/i.test(text) ? 'chatgpt' : /api key/i.test(text) ? 'api-key' : null }
  }
  authCache.set(cmd.path, { at: Date.now(), value })
  return value
}

export function clearProviderCaches() {
  resolveCache.clear()
  versionCache.clear()
  authCache.clear()
}

const CLAUDE_MODELS = [
  { id: 'fable', label: 'Fable', description: 'Most capable model for lessons and feedback.' },
  { id: 'opus', label: 'Opus', description: 'Strong quality, faster than Fable.' },
  { id: 'sonnet', label: 'Sonnet', description: 'Balance of quality and speed.' },
  { id: 'haiku', label: 'Haiku', description: 'Fastest option and lowest subscription usage.' },
]

interface CodexModel {
  slug: string
  visibility?: string
  display_name?: string
  description?: string
  default_reasoning_level?: string
  supported_reasoning_levels?: { effort: string }[]
}

// Keep raw model metadata in the cache so each request can translate its labels.
const modelsCache = new Map<string, { at: number; models: CodexModel[] }>()

async function codexModels(cmd: ProviderCommand | null): Promise<CodexModel[]> {
  const key = cmd?.path || ''
  const cached = modelsCache.get(key)
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.models
  let raw: CodexModel[] | null = null
  if (cmd) {
    const r = await runQuiet(cmd, ['debug', 'models'], 'codex')
    try {
      raw = JSON.parse(r.out).models
    } catch {}
  }
  if (!Array.isArray(raw)) {
    try {
      raw = JSON.parse(fs.readFileSync(path.join(process.env.CODEX_HOME || path.join(home, '.codex'), 'models_cache.json'), 'utf8')).models
    } catch {
      raw = []
    }
  }
  const models = Array.isArray(raw) ? raw.filter((m) => m?.slug && (m.visibility ?? 'list') === 'list') : []
  if (models.length) modelsCache.set(key, { at: Date.now(), models })
  return models
}

/** List the models and effort levels supported by the CLI. */
export async function providerModels(id: ProviderId, overridePath?: string) {
  const effortList = (list: readonly string[]) => list.filter(isEffort).map((effort) => ({ id: effort, label: t(EFFORT_LABELS[effort]) }))
  if (id === 'claude') {
    return {
      models: CLAUDE_MODELS.map((model) => ({ ...model, description: t(model.description), efforts: effortList(EFFORTS) })),
      efforts: effortList(EFFORTS),
      defaultLabel: t('CLI default'),
    }
  }
  const models = (await codexModels(resolveProvider(id, overridePath))).map((model) => ({
    id: model.slug,
    label: model.display_name || model.slug,
    description: model.description || '',
    defaultEffort: model.default_reasoning_level || '',
    efforts: effortList((model.supported_reasoning_levels || []).map(({ effort }) => effort)),
  }))
  return { models, efforts: effortList(EFFORTS), defaultLabel: t('Default from ~/.codex/config.toml') }
}

/**
 * Run one model request.
 */
export function runAI({ provider = 'claude', model, effort, binPath, system, prompt, schema, onProgress, signal, timeoutMs = 6 * 60_000 }: AIRequest): Promise<AIResponse> {
  const cmd = resolveProvider(provider, binPath)
  if (!cmd) {
    return Promise.reject(
      new Error(
        provider === 'claude'
          ? t('Claude Code CLI not found. Install it from https://claude.com/claude-code or set its path in Settings.')
          : t('Codex CLI not found. Install it with npm i -g @openai/codex or set its path in Settings.'),
      ),
    )
  }
  return provider === 'codex'
    ? runCodex({ cmd, model, effort: safeEffort(effort), system, prompt, schema, onProgress, signal, timeoutMs })
    : runClaude({ cmd, model, effort: safeEffort(effort), system, prompt, schema, onProgress, signal, timeoutMs })
}

function spawnWithGuards(cmd, args, { env, signal, timeoutMs, onTimeout }) {
  const child = spawn(cmd.cmd, [...cmd.prefix, ...args], {
    cwd: WORK_DIR,
    env,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const kill = () => {
    try {
      child.kill()
    } catch {}
  }
  const timer = setTimeout(() => {
    onTimeout?.()
    kill()
  }, timeoutMs)
  child.on('close', () => clearTimeout(timer))
  signal?.addEventListener('abort', kill, { once: true })
  return child
}

function tryParseJson(text) {
  if (!text) return null
  const t = text.trim()
  try {
    return JSON.parse(t)
  } catch {}
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) {
    try {
      return JSON.parse(fence[1])
    } catch {}
  }
  const a = t.indexOf('{')
  const b = t.lastIndexOf('}')
  if (a >= 0 && b > a) {
    try {
      return JSON.parse(t.slice(a, b + 1))
    } catch {}
  }
  return null
}

function runClaude({ cmd, model, effort, system, prompt, schema, onProgress, signal, timeoutMs }: ProviderRun): Promise<AIResponse> {
  return new Promise((resolve, reject) => {
    const args = [
      '-p',
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--tools', '',
      '--no-session-persistence',
      '--strict-mcp-config',
    ]
    if (system) args.push('--system-prompt', system)
    if (model) args.push('--model', model)
    if (effort) args.push('--effort', effort)
    if (schema) args.push('--json-schema', JSON.stringify(schema))

    let timedOut = false
    const child = spawnWithGuards(cmd, args, {
      env: cleanEnv('claude', cmd),
      signal,
      timeoutMs,
      onTimeout: () => (timedOut = true),
    })

    let buf = ''
    let stderr = ''
    let chars = 0
    let partial = ''
    let text = ''
    let final = null

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      buf += chunk
      let nl
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (!line) continue
        let ev
        try {
          ev = JSON.parse(line)
        } catch {
          continue
        }
        if (ev.type === 'stream_event') {
          const e = ev.event
          if (e?.type === 'content_block_start' && e.content_block?.type === 'tool_use') partial = ''
          if (e?.type === 'content_block_delta') {
            const d = e.delta || {}
            if (d.type === 'input_json_delta') {
              partial += d.partial_json || ''
              chars += (d.partial_json || '').length
            } else if (d.type === 'text_delta') {
              text += d.text || ''
              chars += (d.text || '').length
            } else if (d.type === 'thinking_delta') {
              chars += (d.thinking || '').length
            }
            onProgress?.({ chars, partial: schema ? partial : text })
          }
        } else if (ev.type === 'result') {
          final = ev
        }
      }
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (d) => (stderr += d))
    child.on('error', (err) => reject(err))
    child.on('close', (code) => {
      if (signal?.aborted) return reject(new Error(t('Cancelled')))
      if (timedOut) return reject(new Error(t('The model response timed out')))
      if (!final) {
        return reject(new Error(t('Claude CLI exited without a result (code {0}). {1}', [code, stderr.slice(-800)]).trim()))
      }
      if (final.is_error) {
        return reject(new Error(String(final.result || final.subtype || t('Claude CLI error'))))
      }
      const resultText = typeof final.result === 'string' ? final.result : text
      const data = schema ? final.structured_output ?? tryParseJson(resultText) : resultText
      if (schema && !data) return reject(new Error(t('The model did not return valid JSON')))
      resolve({ data, text: resultText })
    })
    child.stdin.end(prompt)
  })
}

function runCodex({ cmd, model, effort, system, prompt, schema, onProgress, signal, timeoutMs }: ProviderRun): Promise<AIResponse> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID()
    const outFile = path.join(WORK_DIR, `codex-${id}.txt`)
    const schemaFile = path.join(WORK_DIR, `schema-${id}.json`)
    const args = ['exec', '--skip-git-repo-check', '--ephemeral', '--sandbox', 'read-only', '-o', outFile]
    if (schema) {
      fs.writeFileSync(schemaFile, JSON.stringify(schema))
      args.push('--output-schema', schemaFile)
    }
    if (model) args.push('-m', model)
    if (effort) args.push('-c', `model_reasoning_effort=${JSON.stringify(effort)}`)
    args.push('-')

    let timedOut = false
    const child = spawnWithGuards(cmd, args, {
      env: cleanEnv('codex', cmd),
      signal,
      timeoutMs,
      onTimeout: () => (timedOut = true),
    })
    let stderr = ''
    let chars = 0
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (d) => {
      chars += d.length
      onProgress?.({ chars, partial: '' })
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (d) => {
      stderr += d
      chars += d.length
      onProgress?.({ chars, partial: '' })
    })
    const cleanup = () => {
      for (const f of [outFile, schemaFile]) fs.rm(f, { force: true }, () => {})
    }
    child.on('error', (err) => {
      cleanup()
      reject(err)
    })
    child.on('close', (code) => {
      let out = ''
      try {
        out = fs.readFileSync(outFile, 'utf8')
      } catch {}
      cleanup()
      if (signal?.aborted) return reject(new Error(t('Cancelled')))
      if (timedOut) return reject(new Error(t('The model response timed out')))
      if (!out.trim()) return reject(new Error(t('Codex CLI did not return a response (code {0}). {1}', [code, stderr.slice(-800)]).trim()))
      const data = schema ? tryParseJson(out) : out.trim()
      if (schema && !data) return reject(new Error(t('The model did not return valid JSON')))
      resolve({ data, text: out })
    })
    const full = [
      system ? `# System instructions\n${system}\n` : '',
      'Answer directly. Do not run commands or use tools.\n',
      prompt,
    ].join('\n')
    child.stdin.end(full)
  })
}
