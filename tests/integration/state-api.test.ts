import { EventEmitter } from 'node:events'
import { mkdtemp, rm, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { startServer } from '../../server/app.ts'

const { spawnCli, dockerResult } = vi.hoisted(() => ({
  spawnCli: vi.fn(),
  dockerResult: vi.fn<() => { output: string; exitCode: number }>(),
}))

vi.mock('node:child_process', async (importOriginal) => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  execFileSync: () => { throw new Error('CLI discovery is disabled in this test') },
  spawn: spawnCli,
}))

vi.mock('dockerode', () => ({
  default: class {
    image = ''
    modem = { demuxStream: (source: PassThrough, stdout: PassThrough) => source.pipe(stdout) }

    getImage(image: string) {
      this.image = image
      return { inspect: async () => ({}) }
    }

    getContainer() {
      return {
        inspect: async () => ({
          Config: { Image: this.image, Labels: { 'codenoms.hardened': '1' } },
          State: { Running: true },
        }),
        exec: async () => {
          const { output, exitCode } = dockerResult()
          return {
            start: async () => {
              const stream = new PassThrough()
              setImmediate(() => stream.end(output))
              return stream
            },
            inspect: async () => ({ ExitCode: exitCode }),
          }
        },
      }
    }

    async listContainers() {
      return []
    }
  },
}))

let dataDirectory: string
let server: Awaited<ReturnType<typeof startServer>> | undefined

beforeEach(async () => {
  spawnCli.mockReset()
  dockerResult.mockReset()
  dataDirectory = await mkdtemp(join(tmpdir(), 'codenoms-state-test-'))
  vi.stubEnv('CODENOMS_DATA', dataDirectory)
})

afterEach(async () => {
  try {
    await server?.close()
    server = undefined
    await rm(join(dataDirectory, 'db.json'), { force: true })
    await rmdir(join(dataDirectory, 'workspaces'))
    await rmdir(dataDirectory)
  } finally {
    vi.unstubAllEnvs()
  }
})

async function runServer(systemLanguages?: readonly string[]) {
  vi.resetModules()
  const { startServer } = await import('../../server/app.ts')
  server = await startServer({ host: '127.0.0.1', port: 0, systemLanguages })
  return `http://127.0.0.1:${server.port}`
}

function respondFromCli(output: string) {
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
  })
  let input = ''
  child.stdin.setEncoding('utf8').on('data', (chunk: string) => { input += chunk })
  child.stdin.on('finish', () => {
    child.stdout.end(output)
    child.stderr.end()
    child.emit('close', 0)
  })
  spawnCli.mockReturnValueOnce(child)
  return () => input
}

function saveState(origin: string, state: object) {
  return fetch(`${origin}/api/state`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  })
}

describe('state API', () => {
  it('persists the detected desktop locale and reuses it after restarting the server', async () => {
    const firstServer = await runServer(['und', 'pl-pl'])
    const firstState = await fetch(`${firstServer}/api/state`, { headers: { 'Accept-Language': 'en-US' } })
    expect(firstState.status).toBe(200)
    expect(await firstState.json()).toMatchObject({ settings: { locale: 'pl-PL' } })

    await server!.close()

    const restarted = await runServer(['de-DE'])
    const savedState = await fetch(`${restarted}/api/state`)
    expect(await savedState.json()).toMatchObject({ settings: { locale: 'pl-PL' } })
  })

  it('uses HTTP language preferences when no desktop locales are available', async () => {
    const origin = await runServer()
    const response = await fetch(`${origin}/api/state`, {
      headers: { 'Accept-Language': 'fr-CA;q=0.9,en;q=0.5' },
    })

    expect(await response.json()).toMatchObject({ settings: { locale: 'fr-CA' } })
  })

  it('defaults to English and translates API errors after the user saves another language', async () => {
    const origin = await runServer([])
    const initial = await fetch(`${origin}/api/state`, { headers: { 'Accept-Language': 'und' } })
    expect(await initial.json()).toMatchObject({ settings: { locale: 'en' } })

    const save = await saveState(origin, { settings: { locale: 'pl-pl' }, weakSpots: ['Promise rejection'] })
    expect(save.status).toBe(200)

    for (const body of [undefined, '[]', '{}']) {
      const invalid = await fetch(`${origin}/api/state`, {
        method: 'PUT',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body,
      })
      expect(invalid.status).toBe(400)
      expect(await invalid.json()).toEqual({ error: 'Zły format' })
    }

    const savedState = await fetch(`${origin}/api/state`)
    expect(await savedState.json()).toMatchObject({ settings: { locale: 'pl-PL' }, weakSpots: ['Promise rejection'] })
  })

  it('updates provider descriptions when the user changes the interface language', async () => {
    const origin = await runServer(['en'])
    const english = await fetch(`${origin}/api/providers/claude/models`)
    expect(await english.json()).toMatchObject({
      models: expect.arrayContaining([{ id: 'fable', label: 'Fable', description: 'Most capable model for lessons and feedback.', efforts: expect.any(Array) }]),
    })

    const save = await saveState(origin, { settings: { locale: 'pl' } })
    expect(save.status).toBe(200)

    const polish = await fetch(`${origin}/api/providers/claude/models`)
    expect(await polish.json()).toMatchObject({
      models: expect.arrayContaining([{ id: 'fable', label: 'Fable', description: 'Najmocniejszy model, najlepsza jakość lekcji i ocen.', efforts: expect.any(Array) }]),
    })
  })

  it('localizes cached Codex model options in the current language', async () => {
    const origin = await runServer(['en'])
    await saveState(origin, { settings: { codexBin: process.execPath, locale: 'en' } })
    respondFromCli(JSON.stringify({ models: [{ slug: 'fixture-model', supported_reasoning_levels: [{ effort: 'low' }] }] }))

    const english = await fetch(`${origin}/api/providers/codex/models`)
    expect(await english.json()).toMatchObject({ models: [{ id: 'fixture-model', efforts: [{ id: 'low', label: 'Low' }] }] })

    await saveState(origin, { settings: { codexBin: process.execPath, locale: 'pl' } })
    const polish = await fetch(`${origin}/api/providers/codex/models`)

    expect(await polish.json()).toMatchObject({ models: [{ id: 'fixture-model', efforts: [{ id: 'low', label: 'Niski' }] }] })
    expect(spawnCli).toHaveBeenCalledTimes(1)
  })
})

describe('AI request localization', () => {
  it('sends English instructions and requests the saved response language even when the UI falls back to English', async () => {
    const origin = await runServer(['en'])
    await saveState(origin, { settings: { claudeBin: process.execPath, locale: 'fr-CA' } })
    const prompt = respondFromCli(`${JSON.stringify({ type: 'result', result: 'Une promesse représente un résultat futur.' })}\n`)

    const response = await fetch(`${origin}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept-Language': 'pl' },
      body: JSON.stringify({ question: 'Comment fonctionne une promesse?', context: 'JavaScript promises' }),
    })

    expect(response.status).toBe(200)
    expect(await response.text()).toContain('Une promesse représente un résultat futur.')
    const args: string[] = spawnCli.mock.calls[0][1]
    const system = args[args.indexOf('--system-prompt') + 1]
    expect(system).toContain('You are Codenoms, a programming tutor.')
    expect(system).toContain('Response language: Canadian French (fr-CA).')
    expect(system).toContain('Keep JSON keys, schema enum values, programming syntax and identifiers unchanged.')
    expect(prompt()).toContain('Answer the learner\'s follow-up in the context of the exercise.')
    expect(prompt()).toContain('Comment fonctionne une promesse?')
  })
})

describe('sandbox verification API', () => {
  it('keeps the timeout flag when a container is killed after reporting a passing test', async () => {
    const origin = await runServer(['en'])
    dockerResult.mockReturnValueOnce({ output: 'PASS doubles 3\n', exitCode: 137 })

    try {
      const response = await fetch(`${origin}/api/sandbox/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: 'python', files: [{ path: 'test.py', content: '' }], testCommand: 'python test.py' }),
      })
      const [event] = (await response.text()).trim().split('\n').map((line) => JSON.parse(line))
      expect(event).toMatchObject({ type: 'done', data: { exitCode: 137, timedOut: true } })
    } finally {
      const workspaces = join(dataDirectory, 'workspaces')
      await rm(join(workspaces, 'verify-python.json'), { force: true })
      await rmdir(join(workspaces, 'verify-python'))
    }
  })
})
