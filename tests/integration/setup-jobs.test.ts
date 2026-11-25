import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import type { Express } from 'express'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SetupJob } from '../../src/domain.ts'

const machine = vi.hoisted(() => ({
  installed: false, running: false, winget: true, exitCode: 0, launchError: false,
  spawn: vi.fn(),
}))

vi.mock('node:child_process', () => ({
  execFileSync: (_cmd: string, args: string[]) => {
    if (args[0] === 'winget' && machine.winget) return 'C:\\winget.exe'
    if (args[0] === 'docker' && machine.installed) return 'C:\\docker.exe'
    throw new Error('Not installed')
  },
  spawn: machine.spawn,
}))
vi.mock('node:fs', async (importOriginal) => ({
  default: {
    ...await importOriginal<typeof import('node:fs')>(),
    statSync: (file: string) => {
      if (machine.installed && /Docker Desktop\.exe$|docker\.exe$/.test(file)) return {}
      throw new Error('Not installed')
    },
  },
}))
vi.mock('../../server/locale.ts', () => ({
  t: (message: string, values: unknown[] = []) => message.replace(/\{(\d+)\}/g, (_, index) => String(values[Number(index)])),
}))
vi.mock('../../server/store.ts', () => ({ readState: () => ({ settings: {} }) }))
vi.mock('../../server/providers.ts', () => ({
  providerStatus: async () => ({ available: false }), providerAuth: async () => null,
  providerModels: vi.fn(), clearProviderCaches: vi.fn(),
}))
vi.mock('../../server/sandbox.ts', () => ({
  dockerStatus: async () => ({ available: machine.running }), reconnectDocker: async () => {},
}))

type Handler = (req: any, res: any) => unknown
let routes: Map<string, Handler>

beforeEach(async () => {
  Object.assign(machine, { installed: false, running: false, winget: true, exitCode: 0, launchError: false })
  machine.spawn.mockReset().mockImplementation((command: string) => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(), stderr: new PassThrough(), unref: vi.fn(),
    })
    queueMicrotask(() => {
      if (command.endsWith('Docker Desktop.exe')) {
        if (machine.launchError) child.emit('error', new Error('Cannot launch Docker Desktop'))
        else child.emit('spawn')
      } else {
        if ([0, 3010, 1641, 0x8A150109, 0x8A15010B].includes(machine.exitCode >>> 0)) machine.installed = true
        child.emit('close', machine.exitCode)
      }
    })
    return child
  })
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))
  vi.resetModules()
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')!
  let registerSetup: typeof import('../../server/setup.ts').registerSetup
  try {
    Object.defineProperty(process, 'platform', { value: 'win32' })
    registerSetup = (await import('../../server/setup.ts')).registerSetup
  } finally {
    Object.defineProperty(process, 'platform', platform)
  }
  routes = new Map()
  const app = {
    get: (route: string, handler: Handler) => routes.set(`GET ${route}`, handler),
    post: (route: string, handler: Handler) => routes.set(`POST ${route}`, handler),
  }
  registerSetup(app as unknown as Express, process.cwd())
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function request(route: string, params = {}) {
  let body: any
  const response = {
    json: (value: unknown) => { body = value }, set: () => response, status: () => response,
  }
  await routes.get(route)!({ params, body: {} }, response)
  return body
}

async function install() {
  await request('POST /api/setup/jobs/:kind', { kind: 'docker-install' })
}

async function installation(): Promise<SetupJob> {
  return (await request('GET /api/setup/jobs'))['docker-install']
}

describe('Docker installation on Windows', () => {
  it('offers automatic installation only when winget is available', async () => {
    expect((await request('GET /api/setup/status')).docker).toMatchObject({
      installed: false, running: false, problem: 'missing', help: { autoInstall: true },
    })
    machine.winget = false
    expect((await request('GET /api/setup/status')).docker.help.autoInstall).toBe(false)
    expect(machine.spawn).not.toHaveBeenCalled()
  })

  it.each([3010, 1641, 0x8A150109, 0x8A150109 | 0, 0x8A15010B])('treats restart exit code %s as a next step, without launching Docker', async (code) => {
    machine.exitCode = code
    await install()
    await vi.waitFor(async () => {
      expect(await installation()).toMatchObject({ status: 'action-required', step: 'Restart Windows to finish installation', error: null })
    })
    expect(machine.spawn).toHaveBeenCalledTimes(1)
    expect((await installation()).message).toContain('Check again')
  })

  it('asks for a retry after restarting when installation could not begin', async () => {
    machine.exitCode = 0x8A15010A
    await install()
    await vi.waitFor(async () => {
      expect(await installation()).toMatchObject({ status: 'action-required', step: 'Restart Windows before installing' })
    })
    expect((await installation()).message).toContain('try installing Docker Desktop again')
    expect(machine.installed).toBe(false)
  })

  it('reports genuine installation failures as errors', async () => {
    machine.exitCode = 5
    await install()
    await vi.waitFor(async () => { expect((await installation()).status).toBe('error') })
    expect((await installation()).error).toContain('code 5')
    expect(machine.spawn).toHaveBeenCalledTimes(1)
  })

  it('finishes successfully once Docker is available', async () => {
    machine.running = true
    await install()
    await vi.waitFor(async () => { expect((await installation()).status).toBe('done') })
    expect(machine.spawn).toHaveBeenCalledTimes(2)
  })

  it('asks the user to finish setup when Docker was installed but remains unavailable', async () => {
    vi.useFakeTimers()
    await install()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(await installation()).toMatchObject({ status: 'action-required', step: 'Finish setting up Docker Desktop', error: null })
    expect((await installation()).message).toContain('is installed but is not ready yet')
  })

  it('handles a failure to launch Docker without an unhandled process error', async () => {
    machine.launchError = true
    await install()
    await vi.waitFor(async () => { expect((await installation()).status).toBe('error') })
    expect((await installation()).error).toBe('Cannot launch Docker Desktop')
  })
})
