import { test as base, expect } from '@playwright/test'
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PersistedState } from '../../../src/domain.ts'
import { responses, state } from './data.ts'

type AIResponse = { data?: unknown; error?: string }
type App = {
  url: string
  seed: (saved: PersistedState) => Promise<void>
  saved: () => Promise<PersistedState>
  ai: (overrides: Record<string, AIResponse>) => Promise<void>
  calls: () => Promise<{ task: string; args: string[] }[]>
}

export const test = base.extend<{ app: App }>({
  baseURL: async ({ app }, use) => { await use(app.url) },
  app: async ({ playwright }, use, testInfo) => {
    const directory = await mkdtemp(join(tmpdir(), 'thinkling-e2e-'))
    const cliRoot = join(directory, 'cli')
    const fakeCli = fileURLToPath(new URL('./fake-cli.cjs', import.meta.url))
    const bins: Record<string, string> = {}
    for (const [provider, script] of [
      ['claude', '@anthropic-ai/claude-code/cli.js'], ['codex', '@openai/codex/bin/codex.js'],
    ]) {
      const target = join(cliRoot, 'node_modules', script)
      await mkdir(dirname(target), { recursive: true })
      await copyFile(fakeCli, target)
      bins[provider] = join(cliRoot, `${provider}.cmd`)
      await writeFile(bins[provider], '')
    }
    const responseFile = join(directory, 'responses.json')
    const callsFile = join(directory, 'calls.jsonl')
    await writeFile(responseFile, JSON.stringify(responses))
    await writeFile(callsFile, '')
    const initial = state()
    initial.settings.claudeBin = bins.claude
    initial.settings.codexBin = bins.codex
    await writeFile(join(directory, 'db.json'), JSON.stringify(initial))
    const child = fork(fileURLToPath(new URL('./server.ts', import.meta.url)), [], {
      env: { ...process.env, THINKLING_DATA: directory, CLAUDE_BIN: bins.claude, CODEX_BIN: bins.codex, E2E_CLI_ROOT: cliRoot, E2E_RESPONSES: responseFile, E2E_CALLS: callsFile },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    })
    let logs = ''
    child.stdout!.on('data', (data) => { logs += data })
    child.stderr!.on('data', (data) => { logs += data })
    let request: Awaited<ReturnType<typeof playwright.request.newContext>> | undefined
    try {
      const { port } = await new Promise<{ port: number }>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`E2E server startup timed out:\n${logs}`)), 15_000)
        child.once('message', (message) => { clearTimeout(timer); resolve(message as { port: number }) })
        child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`E2E server exited (${code}):\n${logs}`)) })
        child.once('error', (error) => { clearTimeout(timer); reject(error) })
      })
      const url = `http://127.0.0.1:${port}`
      request = await playwright.request.newContext({ baseURL: url })
      await use({
        url,
        async seed(saved) {
          const result = await request!.put('/api/state', { data: { ...saved, settings: { ...saved.settings, claudeBin: bins.claude, codexBin: bins.codex } } })
          expect(result.ok()).toBeTruthy()
        },
        async saved() { return (await request!.get('/api/state')).json() },
        async ai(overrides) { await writeFile(responseFile, JSON.stringify({ ...responses, ...overrides })) },
        async calls() { return (await readFile(callsFile, 'utf8')).trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)) },
      })
    } finally {
      await request?.dispose()
      if (child.pid && child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit')
        if (child.connected) child.send('stop')
        const timer = setTimeout(() => child.kill(), 5000)
        await exited
        clearTimeout(timer)
      }
      if (testInfo.status !== testInfo.expectedStatus) await testInfo.attach('server.log', { body: logs, contentType: 'text/plain' })
      await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    }
  },
  page: async ({ page }, use) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await use(page)
    expect(errors, 'Uncaught browser errors').toEqual([])
  },
})

export { expect } from '@playwright/test'
