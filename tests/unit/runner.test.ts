import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { allTestsPassed, runTests } from '../../src/lib/runner.ts'
import { transpileTypeScript } from '../../src/lib/monaco.ts'

vi.mock('../../src/lib/monaco.ts', () => ({ transpileTypeScript: vi.fn() }))

class TestWorker {
  static instances: TestWorker[] = []
  onmessage: ((event: { data: unknown }) => void) | null = null
  onerror: ((event: { message?: string }) => void) | null = null
  postMessage = vi.fn()
  terminate = vi.fn()
  constructor() { TestWorker.instances.push(this) }
}

beforeEach(() => {
  vi.useFakeTimers()
  TestWorker.instances = []
  vi.stubGlobal('Worker', TestWorker)
  vi.mocked(transpileTypeScript).mockReset()
})
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllTimers(); vi.useRealTimers() })

describe('browser code runner', () => {
  it('sends code and tests to an isolated worker and terminates after the result', async () => {
    const pending = runTests({ code: 'const n = 1', tests: 'test code', language: 'javascript' })
    const worker = TestWorker.instances[0]
    expect(worker.postMessage).toHaveBeenCalledWith({ code: 'const n = 1', tests: 'test code' })
    const result = { results: [{ name: 'works', ok: true }], logs: [] }
    worker.onmessage!({ data: result })
    expect(await pending).toEqual(result)
    expect(worker.terminate).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('transpiles TypeScript before running it', async () => {
    vi.mocked(transpileTypeScript).mockResolvedValue('const n = 1;')
    const pending = runTests({ code: 'const n: number = 1', tests: '', language: 'typescript' })
    await vi.advanceTimersByTimeAsync(0)
    const worker = TestWorker.instances[0]
    expect(worker.postMessage).toHaveBeenCalledWith({ code: 'const n = 1;', tests: '' })
    worker.onmessage!({ data: { results: [] } })
    await pending
  })

  it('returns a compiler error without starting a worker when transpilation fails', async () => {
    vi.mocked(transpileTypeScript).mockRejectedValue(new Error('Invalid syntax'))
    await expect(runTests({ code: 'bad', tests: '', language: 'typescript' })).resolves.toMatchObject({ compileError: 'TypeScript: Invalid syntax', results: [] })
    expect(TestWorker.instances).toHaveLength(0)
  })

  it.each(['Worker crashed', undefined])('reports worker errors (%s)', async (message) => {
    const pending = runTests({ code: '', tests: '', language: 'javascript' })
    const worker = TestWorker.instances[0]
    worker.onerror!({ message })
    expect(await pending).toMatchObject({ compileError: message || 'Worker error', results: [] })
    expect(worker.terminate).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('terminates an unresponsive worker after ten seconds', async () => {
    const pending = runTests({ code: 'while(true){}', tests: '', language: 'javascript' })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await pending).toMatchObject({ timedOut: true, results: [], compileError: expect.stringContaining('10 s limit') })
    expect(TestWorker.instances[0].terminate).toHaveBeenCalledTimes(1)
  })

  it.each([
    [null, false], [undefined, false], [{ results: [] }, false],
    [{ results: [{ name: 'ok', ok: true }] }, true],
    [{ results: [{ name: 'fail', ok: false }] }, false],
    [{ results: [{ name: 'ok', ok: true }], timedOut: true }, false],
    [{ results: [{ name: 'ok', ok: true }], compileError: 'invalid' }, false],
  ])('requires a completed, nonempty, passing test run: %j', (run, expected) => {
    expect(allTestsPassed(run)).toBe(expected)
  })
})
