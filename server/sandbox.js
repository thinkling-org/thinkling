// Piaskownica: prawdziwe środowiska uruchomieniowe w kontenerach Dockera.
// Każde zadanie ma własny workspace (katalog na dysku podmontowany jako /workspace)
// i własny kontener bez sieci, z limitami pamięci / CPU / procesów.
import { initialDocker, findWorkingDocker } from './docker-connect.js'
import tar from 'tar-stream'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { StringDecoder } from 'node:string_decoder'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = path.resolve(process.env.CODENOMS_DATA || path.join(ROOT, 'data'))
const WS_ROOT = path.join(DATA_DIR, 'workspaces')
fs.mkdirSync(WS_ROOT, { recursive: true })

// `let`, bo po instalacji / uruchomieniu Dockera adres może się zmienić (reconnectDocker).
export let { docker, endpoint: dockerEndpoint } = initialDocker()

/** Szuka działającego Dockera wśród znanych gniazd i przełącza na niego połączenie. */
export async function reconnectDocker() {
  const found = await findWorkingDocker()
  if (found) {
    docker = found.docker
    dockerEndpoint = found.endpoint
  }
  return found
}
const LABEL = 'codenoms'
const desktopNamespace = process.versions.electron
  ? createHash('sha256').update(WS_ROOT).digest('hex').slice(0, 12)
  : null
const containerLabel = desktopNamespace ? `codenoms.desktop.${desktopNamespace}` : LABEL
const IDLE_MS = 20 * 60_000

// Kod w piaskownicy nie działa jako root. Na Linuksie kontener dostaje UID/GID użytkownika,
// który uruchomił serwer, więc pliki w workspace mają właściwego właściciela na dysku.
// Docker Desktop (Windows, macOS) sam mapuje uprawnienia podmontowanych katalogów.
const hostUid = process.platform === 'linux' ? process.getuid?.() : undefined
const SANDBOX_UID = hostUid || 1000
const SANDBOX_GID = hostUid ? process.getgid() : 1000
export const SANDBOX_USER = `${SANDBOX_UID}:${SANDBOX_GID}`
// Katalog domowy w /tmp, który jest zapisywalny dla wszystkich.
const SANDBOX_HOME = '/tmp'

// Obrazy budują się lokalnie, więc od razu dostają wpis w /etc/passwd dla UID piaskownicy
// (bez niego m.in. .NET nie tworzy nazwanych mutexów). Istniejący wpis (np. „node”) zostaje.
const COMMON = `ARG SANDBOX_UID=1000
ARG SANDBOX_GID=1000
RUN grep -q "^[^:]*:[^:]*:\${SANDBOX_GID}:" /etc/group || echo "codenoms:x:\${SANDBOX_GID}:" >> /etc/group; \\
    grep -q "^[^:]*:[^:]*:\${SANDBOX_UID}:" /etc/passwd || echo "codenoms:x:\${SANDBOX_UID}:\${SANDBOX_GID}::${SANDBOX_HOME}:/bin/bash" >> /etc/passwd
RUN mkdir -p /workspace
WORKDIR /workspace
ENV TERM=xterm-256color LANG=C.UTF-8 PS1='\\[\\e[1;35m\\]codenoms\\[\\e[0m\\]:\\[\\e[1;34m\\]\\w\\[\\e[0m\\]$ '
`

/** Środowiska per język. Obrazy budowane lokalnie przy pierwszym użyciu. */
export const ENVS = {
  php: {
    label: 'PHP 8.3',
    image: 'codenoms/php:2',
    dockerfile: `FROM php:8.3-cli-alpine\nRUN apk add --no-cache bash\nCOPY --from=composer:2 /usr/bin/composer /usr/bin/composer\n${COMMON}`,
    testExample: 'php tests/run.php',
  },
  cpp: {
    label: 'C++20 (g++)',
    image: 'codenoms/cpp:2',
    dockerfile: `FROM alpine:3.20\nRUN apk add --no-cache bash g++ make cmake gdb\n${COMMON}`,
    testExample: 'g++ -std=c++20 -Wall -O0 -o /tmp/tests tests/tests.cpp && /tmp/tests',
  },
  python: {
    label: 'Python 3.12',
    image: 'codenoms/python:2',
    dockerfile: `FROM python:3.12-alpine\nRUN apk add --no-cache bash\nENV PYTHONDONTWRITEBYTECODE=1\n${COMMON}`,
    testExample: 'python tests/run.py',
  },
  javascript: {
    label: 'Node 22',
    image: 'codenoms/node:2',
    dockerfile: `FROM node:22-alpine\nRUN apk add --no-cache bash && npm i -g tsx typescript\n${COMMON}`,
    testExample: 'node tests/run.js',
  },
  typescript: {
    label: 'Node 22 + TypeScript',
    image: 'codenoms/node:2',
    dockerfile: `FROM node:22-alpine\nRUN apk add --no-cache bash && npm i -g tsx typescript\n${COMMON}`,
    testExample: 'tsx tests/run.ts',
  },
  go: {
    label: 'Go 1.23',
    image: 'codenoms/go:2',
    dockerfile: `FROM golang:1.23-alpine\nRUN apk add --no-cache bash\nENV GOCACHE=/tmp/gocache GOFLAGS=-mod=mod GOTOOLCHAIN=local\n${COMMON}`,
    testExample: 'go test -v ./...',
  },
  rust: {
    label: 'Rust',
    image: 'codenoms/rust:2',
    dockerfile: `FROM rust:1-alpine\nRUN apk add --no-cache bash musl-dev\n${COMMON}`,
    testExample: 'rustc --edition 2021 -o /tmp/tests tests/main.rs && /tmp/tests',
  },
  java: {
    label: 'Java 21',
    image: 'codenoms/java:2',
    dockerfile: `FROM eclipse-temurin:21-jdk-alpine\nRUN apk add --no-cache bash\n${COMMON}`,
    testExample: "javac -d /tmp/out $(find . -name '*.java') && java -cp /tmp/out TestRunner",
  },
  csharp: {
    label: '.NET 8',
    image: 'codenoms/dotnet:2',
    // bin/ i obj/ poza workspace: na Docker Desktop (Windows) użytkownik bez roota nie może mapować
    // (mmap) plików w podmontowanym katalogu o długiej ścieżce, a build .NET tego wymaga.
    dockerfile: `FROM mcr.microsoft.com/dotnet/sdk:8.0-alpine\nRUN apk add --no-cache bash\nENV DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1 UseArtifactsOutput=true ArtifactsPath=/tmp/dotnet-artifacts\n${COMMON}`,
    testExample: 'dotnet run --project tests',
  },
  ruby: {
    label: 'Ruby 3.3',
    image: 'codenoms/ruby:2',
    dockerfile: `FROM ruby:3.3-alpine\nRUN apk add --no-cache bash\n${COMMON}`,
    testExample: 'ruby tests/run.rb',
  },
  sql: {
    label: 'SQLite',
    image: 'codenoms/sqlite:2',
    dockerfile: `FROM alpine:3.20\nRUN apk add --no-cache bash sqlite\n${COMMON}`,
    testExample: 'bash tests/run.sh',
  },
}
ENVS.c = ENVS.cpp

export function envFor(lang) {
  return ENVS[String(lang || '').toLowerCase()] || null
}

// --------------------------------------------------------------- status / obrazy

export async function dockerStatus() {
  try {
    const v = await docker.version()
    return { available: true, version: v.Version, endpoint: dockerEndpoint?.label || null }
  } catch (err) {
    const found = await reconnectDocker()
    if (found && !found.permission) {
      const v = await docker.version().catch(() => null)
      if (v) return { available: true, version: v.Version, endpoint: dockerEndpoint?.label || null }
    }
    return {
      available: false,
      code: found?.permission ? 'EACCES' : err.code,
      error: found?.permission ? 'Brak uprawnień do Dockera (dodaj konto do grupy „docker”)' : err.code === 'ENOENT' ? 'Docker nie działa (uruchom Docker Desktop)' : err.message,
    }
  }
}

export async function imageExists(tag) {
  try {
    await docker.getImage(tag).inspect()
    return true
  } catch {
    return false
  }
}

const building = new Map()

export function ensureImage(lang, onProgress) {
  const env = envFor(lang)
  if (!env) return Promise.reject(new Error(`Brak środowiska dla języka: ${lang}`))
  if (building.has(env.image)) return building.get(env.image)
  const p = (async () => {
    if (await imageExists(env.image)) return env
    onProgress?.(`Buduję środowisko ${env.label} (jednorazowo)…`)
    const pack = tar.pack()
    pack.entry({ name: 'Dockerfile' }, env.dockerfile)
    pack.finalize()
    const stream = await docker.buildImage(pack, {
      t: env.image,
      labels: { [LABEL]: '1' },
      buildargs: { SANDBOX_UID: String(SANDBOX_UID), SANDBOX_GID: String(SANDBOX_GID) },
    })
    await new Promise((resolve, reject) => {
      docker.modem.followProgress(
        stream,
        (err, out) => {
          const failed = err || out?.find((o) => o.error)
          failed ? reject(new Error(err?.message || failed.error)) : resolve()
        },
        (ev) => {
          const line = (ev.stream || ev.status || '').trim()
          if (line) onProgress?.(line.slice(0, 160))
        },
      )
    })
    return env
  })().finally(() => building.delete(env.image))
  building.set(env.image, p)
  return p
}

// --------------------------------------------------------------- workspace na dysku

export function safeId(id) {
  const s = String(id || '')
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(s)) throw new Error('Nieprawidłowy identyfikator workspace')
  return s
}

function wsDir(wsId) {
  return path.join(WS_ROOT, safeId(wsId))
}

function metaFile(wsId) {
  return path.join(WS_ROOT, `${safeId(wsId)}.json`)
}

export function readMeta(wsId) {
  try {
    return JSON.parse(fs.readFileSync(metaFile(wsId), 'utf8'))
  } catch {
    return null
  }
}

function resolveInWs(wsId, rel) {
  const base = wsDir(wsId)
  const p = path.resolve(base, String(rel || '').replace(/^[/\\]+/, ''))
  if (p !== base && !p.startsWith(base + path.sep)) throw new Error('Ścieżka poza workspace')
  return p
}

/** Zapisuje pliki do workspace. `reset` czyści katalog przed zapisem. */
export function seedWorkspace(wsId, files, { lang, reset = false } = {}) {
  const dir = wsDir(wsId)
  if (reset) fs.rmSync(dir, { recursive: true, force: true })
  const fresh = !fs.existsSync(dir)
  fs.mkdirSync(dir, { recursive: true })
  if (fresh || reset) {
    for (const f of files || []) {
      if (!f?.path) continue
      const p = resolveInWs(wsId, f.path)
      fs.mkdirSync(path.dirname(p), { recursive: true })
      fs.writeFileSync(p, f.content ?? '')
    }
  }
  if (lang) fs.writeFileSync(metaFile(wsId), JSON.stringify({ lang, updatedAt: Date.now() }))
  return fresh || reset
}

const SKIP_DIRS = new Set(['node_modules', 'vendor', '.git', 'target', '__pycache__', 'obj', 'bin', '.idea', '.vscode'])

export function listFiles(wsId) {
  const base = wsDir(wsId)
  const out = []
  const walk = (dir, depth) => {
    if (depth > 8 || out.length > 800) return
    let entries = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const full = path.join(dir, e.name)
      const rel = path.relative(base, full).split(path.sep).join('/')
      if (e.isDirectory()) {
        out.push({ path: rel, dir: true, skipped: SKIP_DIRS.has(e.name) })
        if (!SKIP_DIRS.has(e.name)) walk(full, depth + 1)
      } else if (e.isFile()) {
        const st = fs.statSync(full)
        out.push({ path: rel, dir: false, size: st.size, mtime: st.mtimeMs })
      }
    }
  }
  walk(base, 0)
  return out.sort((a, b) => a.path.localeCompare(b.path))
}

export function readFile(wsId, rel) {
  const p = resolveInWs(wsId, rel)
  const st = fs.statSync(p)
  if (st.size > 1_000_000) throw new Error('Plik za duży do edycji (>1 MB)')
  return { content: fs.readFileSync(p, 'utf8'), mtime: st.mtimeMs }
}

export function writeFile(wsId, rel, content) {
  const p = resolveInWs(wsId, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content ?? '')
  return { mtime: fs.statSync(p).mtimeMs }
}

export function deletePath(wsId, rel) {
  const p = resolveInWs(wsId, rel)
  if (p === wsDir(wsId)) throw new Error('Nie można usunąć katalogu głównego')
  fs.rmSync(p, { recursive: true, force: true })
}

// --------------------------------------------------------------- kontenery

const lastUsed = new Map()

function containerName(wsId) {
  const prefix = desktopNamespace ? `codenoms-desktop-${desktopNamespace}` : 'codenoms'
  return `${prefix}-${safeId(wsId)}`
}

export async function ensureContainer(wsId, lang, onProgress) {
  const env = await ensureImage(lang, onProgress)
  const name = containerName(wsId)
  lastUsed.set(name, Date.now())
  const existing = docker.getContainer(name)
  try {
    const info = await existing.inspect()
    // Kontenery sprzed utwardzenia (root, pełne uprawnienia) tworzymy od nowa.
    if (info.Config.Image !== env.image || info.Config.Labels?.['codenoms.hardened'] !== '1') {
      await existing.remove({ force: true })
    } else {
      if (!info.State.Running) await existing.start()
      return existing
    }
  } catch {
    /* nie istnieje */
  }
  fs.mkdirSync(wsDir(wsId), { recursive: true })
  const c = await docker.createContainer({
    name,
    Image: env.image,
    Cmd: ['sleep', 'infinity'],
    WorkingDir: '/workspace',
    Tty: false,
    Labels: { [containerLabel]: '1', 'codenoms.ws': wsId, 'codenoms.hardened': '1' },
    User: SANDBOX_USER,
    Env: ['TERM=xterm-256color', `HOME=${SANDBOX_HOME}`],
    HostConfig: {
      Mounts: [{ Type: 'bind', Source: wsDir(wsId), Target: '/workspace' }],
      NetworkMode: 'none',
      Memory: 1024 * 1024 * 1024,
      MemorySwap: 1024 * 1024 * 1024,
      NanoCpus: 2_000_000_000,
      PidsLimit: 512,
      CapDrop: ['ALL'],
      SecurityOpt: ['no-new-privileges:true'],
      AutoRemove: true,
    },
  })
  await c.start()
  return c
}

/** Wykonuje komendę w kontenerze (bez TTY) z limitem czasu. */
export async function execIn(wsId, lang, cmd, { timeoutSec = 60, onProgress } = {}) {
  const c = await ensureContainer(wsId, lang, onProgress)
  const exec = await c.exec({
    Cmd: ['timeout', '-s', 'KILL', String(timeoutSec), 'bash', '-c', cmd],
    AttachStdout: true,
    AttachStderr: true,
    WorkingDir: '/workspace',
    Tty: false,
  })
  const stream = await exec.start({ hijack: true, stdin: false })
  let output = ''
  const cap = (chunk) => {
    if (output.length < 200_000) output += chunk.toString('utf8')
  }
  const out = new PassThrough()
  const err = new PassThrough()
  out.on('data', cap)
  err.on('data', cap)
  docker.modem.demuxStream(stream, out, err)
  await new Promise((resolve) => {
    const t = setTimeout(resolve, (timeoutSec + 5) * 1000)
    stream.on('end', () => (clearTimeout(t), resolve()))
    stream.on('close', () => (clearTimeout(t), resolve()))
  })
  const info = await exec.inspect()
  const exitCode = info.ExitCode ?? -1
  return { exitCode, output, timedOut: exitCode === 137 }
}

/** Interaktywna powłoka (TTY) podpięta do WebSocketu. */
export async function attachShell(wsId, ws) {
  const meta = readMeta(wsId)
  if (!meta?.lang) throw new Error('Workspace nie istnieje')
  const c = await ensureContainer(wsId, meta.lang)
  const exec = await c.exec({
    Cmd: ['bash', '-i'],
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: true,
    WorkingDir: '/workspace',
    Env: ['TERM=xterm-256color'],
  })
  const stream = await exec.start({ hijack: true, stdin: true, Tty: true })
  const dec = new StringDecoder('utf8')
  stream.on('data', (d) => {
    lastUsed.set(containerName(wsId), Date.now())
    if (ws.readyState === 1) ws.send(dec.write(d))
  })
  stream.on('end', () => ws.readyState === 1 && ws.close())
  ws.on('message', (raw) => {
    let msg
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      return
    }
    if (msg.t === 'i' && typeof msg.d === 'string') stream.write(msg.d)
    else if (msg.t === 'r' && msg.c > 0 && msg.r > 0) exec.resize({ h: msg.r, w: msg.c }).catch(() => {})
  })
  ws.on('close', () => {
    try {
      stream.write('exit\n')
      stream.end()
    } catch {}
  })
}

export async function stopWorkspace(wsId) {
  try {
    await docker.getContainer(containerName(wsId)).remove({ force: true })
  } catch {}
}

/** Usuwa kontenery piaskownicy należące do tej instancji aplikacji. */
export async function cleanupAll() {
  try {
    const list = await docker.listContainers({ all: true, filters: { label: [`${containerLabel}=1`] } })
    await Promise.all(list.map((c) => docker.getContainer(c.Id).remove({ force: true }).catch(() => {})))
  } catch {}
}

// zatrzymuj bezczynne kontenery
setInterval(async () => {
  const now = Date.now()
  for (const [name, t] of lastUsed) {
    if (now - t > IDLE_MS) {
      lastUsed.delete(name)
      docker.getContainer(name).remove({ force: true }).catch(() => {})
    }
  }
}, 60_000).unref()

// --------------------------------------------------------------- testy

/**
 * Protokół testów: każda linia "PASS <nazwa>" albo "FAIL <nazwa> :: <opis>".
 * Dodatkowo rozumiemy format `go test -v` ("--- PASS: TestX").
 */
export function parseTestOutput(output, exitCode) {
  const results = []
  for (const raw of String(output).split(/\r?\n/)) {
    const line = raw.replace(/\x1b\[[0-9;]*m/g, '').trim()
    let m = line.match(/^(PASS|FAIL)\s+(.+?)(?:\s+::\s+(.*))?$/)
    if (m) {
      results.push({ name: m[2], ok: m[1] === 'PASS', error: m[3] || (m[1] === 'FAIL' ? 'test nie przeszedł' : undefined) })
      continue
    }
    m = line.match(/^---\s+(PASS|FAIL):\s+(\S+)/)
    if (m) results.push({ name: m[2], ok: m[1] === 'PASS', error: m[1] === 'FAIL' ? 'test nie przeszedł' : undefined })
  }
  const tail = String(output).split(/\r?\n/).slice(-40).join('\n').trim()
  const compileError = !results.length && exitCode !== 0 ? tail || `kod wyjścia ${exitCode}` : undefined
  if (results.length && exitCode !== 0 && results.every((r) => r.ok)) {
    results.push({ name: '(proces)', ok: false, error: `zakończył się kodem ${exitCode}` })
  }
  return { results, compileError, logs: [{ level: 'log', text: output }], exitCode }
}

/** Jednorazowe uruchomienie testów na zestawie plików (weryfikacja zadania). */
export async function verifyRun({ language, files, testCommand, onProgress }) {
  const lang = String(language).toLowerCase()
  const verifyWs = `verify-${lang}`
  const sub = `run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  seedWorkspace(verifyWs, [], { lang })
  const subDir = resolveInWs(verifyWs, sub)
  fs.mkdirSync(subDir, { recursive: true })
  for (const f of files || []) {
    const p = path.resolve(subDir, f.path.replace(/^[/\\]+/, ''))
    if (!p.startsWith(subDir + path.sep)) continue
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, f.content ?? '')
  }
  try {
    // Osobny katalog artefaktów .NET na każde uruchomienie (kontener weryfikacji jest współdzielony).
    const r = await execIn(verifyWs, lang, `cd /workspace/${sub} && export ArtifactsPath=/tmp/dotnet-artifacts/${sub} && ${testCommand}`, { timeoutSec: 90, onProgress })
    return parseTestOutput(r.output, r.exitCode)
  } finally {
    fs.rmSync(subDir, { recursive: true, force: true })
  }
}
