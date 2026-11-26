import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Exercise, TestRun } from '../../src/domain.ts'
import { runTests } from '../../src/lib/runner.ts'
import { verifyExercise } from '../../src/lib/validate.ts'

const exercise: Exercise = {
  id: 'double', type: 'code', stage: 'check', prompt: 'Double the input.',
  codeLanguage: 'javascript', runtime: 'browser',
  starterCode: 'function double(n) { return n }',
  solution: 'function double(n) { return n * 2 }',
  tests: "test('doubles 3', () => expect(double(3)).toBe(6))",
}
const pass = { results: [{ name: 'doubles 3', ok: true }] } satisfies TestRun
const fail = { results: [{ name: 'doubles 3', ok: false, error: 'expected 6, got 3' }] } satisfies TestRun
const fetchResponse = vi.fn<typeof fetch>()
const workerResult = vi.fn<() => TestRun>()

class TestWorker {
  onmessage?: (event: { data: TestRun }) => void

  postMessage() {
    const data = workerResult()
    queueMicrotask(() => this.onmessage?.({ data }))
  }

  terminate() {}
}

function stream(...messages: object[]) {
  return new Response(messages.map((message) => JSON.stringify(message)).join('\n') + '\n')
}

beforeEach(() => {
  fetchResponse.mockReset()
  workerResult.mockReset()
  vi.stubGlobal('fetch', fetchResponse)
  vi.stubGlobal('Worker', TestWorker)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('runTests', () => {
  it('stops an unresponsive worker and reports a timeout', async () => {
    vi.useFakeTimers()
    const terminate = vi.fn()
    vi.stubGlobal('Worker', class {
      postMessage() {}
      terminate = terminate
    })

    const result = runTests({ code: exercise.solution!, tests: exercise.tests!, language: 'javascript' })
    await vi.advanceTimersByTimeAsync(10_000)

    await expect(result).resolves.toMatchObject({ results: [], timedOut: true })
    expect(terminate).toHaveBeenCalledOnce()
  })
})

describe('verifyExercise', () => {
  it('does not treat a starter timeout as evidence that the generated tests work', async () => {
    workerResult.mockReturnValueOnce(pass).mockReturnValueOnce({
      results: [], compileError: 'Time limit expired', timedOut: true,
    })
    fetchResponse.mockResolvedValueOnce(stream({ type: 'error', message: 'Repair unavailable' }))

    await expect(verifyExercise(exercise)).resolves.toMatchObject({ status: 'unverified' })
  })

  it('returns an unverified result when the browser cannot start a test worker', async () => {
    vi.stubGlobal('Worker', class {
      constructor() {
        throw new Error('Worker unavailable')
      }
    })

    await expect(verifyExercise(exercise)).resolves.toEqual({ status: 'unverified', note: 'Worker unavailable' })
  })

  it('verifies a passing reference solution and a failing starter without asking for a repair', async () => {
    workerResult.mockReturnValueOnce(pass).mockReturnValueOnce(fail)

    await expect(verifyExercise(exercise)).resolves.toMatchObject({ status: 'verified', fixed: false, total: 1 })
    expect(fetchResponse).not.toHaveBeenCalled()
  })

  it.each([
    { runtime: 'review' as const, language: 'javascript' },
    { runtime: 'browser' as const, language: 'ruby' },
  ])('uses review only for $runtime in $language', async ({ runtime, language }) => {
    await expect(verifyExercise({ ...exercise, runtime, codeLanguage: language })).resolves.toEqual({ status: 'review-only' })
    expect(workerResult).not.toHaveBeenCalled()
  })

  it('publishes a successful repair without replacing files or code omitted by the model', async () => {
    const repairedTests = "test('doubles 4', () => expect(double(4)).toBe(8))"
    workerResult.mockReturnValueOnce(pass).mockReturnValueOnce(pass).mockReturnValueOnce(pass).mockReturnValueOnce(fail)
    fetchResponse.mockResolvedValueOnce(stream({
      type: 'done', data: { tests: repairedTests, starterCode: '', note: 'Distinguish the solution from the starter' },
    }))
    const onStage = vi.fn()

    await expect(verifyExercise(exercise, 'javascript', { onStage })).resolves.toEqual({
      status: 'verified', fixed: true, total: 1, note: 'Distinguish the solution from the starter',
      patch: { tests: repairedTests, solution: exercise.solution, starterCode: exercise.starterCode },
    })
    expect(onStage.mock.calls).toEqual([['fixing'], ['validating']])
  })

  it('stops after one repair when the new tests still pass the starter', async () => {
    workerResult.mockReturnValue(pass)
    fetchResponse.mockResolvedValueOnce(stream({ type: 'done', data: { note: 'Attempted repair' } }))

    await expect(verifyExercise(exercise)).resolves.toMatchObject({ status: 'unverified', note: 'Attempted repair' })
    expect(fetchResponse).toHaveBeenCalledTimes(1)
  })

  it('returns the attempted patch even when repaired browser tests still fail', async () => {
    workerResult.mockReturnValue(fail)
    fetchResponse.mockResolvedValueOnce(stream({ type: 'done', data: { tests: 'repaired tests', note: 'Tried a different assertion' } }))

    await expect(verifyExercise(exercise)).resolves.toEqual({
      status: 'unverified', note: 'Tried a different assertion',
      patch: { tests: 'repaired tests', solution: exercise.solution, starterCode: exercise.starterCode },
    })
    expect(workerResult).toHaveBeenCalledTimes(4)
  })

  it('discards a failed repair and only reports unverified', async () => {
    workerResult.mockReturnValueOnce(pass).mockReturnValueOnce(pass)
    fetchResponse.mockResolvedValueOnce(stream({ type: 'error', message: 'Repair unavailable' }))
    const onStage = vi.fn()

    await expect(verifyExercise(exercise, undefined, { onStage })).resolves.toEqual({ status: 'unverified' })
    expect(onStage.mock.calls).toEqual([['fixing']])
  })

  it('accepts a starter compile failure as a failing attempt when the reference passes', async () => {
    workerResult.mockReturnValueOnce(pass).mockReturnValueOnce({ results: [], compileError: 'Incomplete starter' })

    await expect(verifyExercise(exercise)).resolves.toMatchObject({ status: 'verified', fixed: false })
    expect(fetchResponse).not.toHaveBeenCalled()
  })
})

describe('Docker exercise verification', () => {
  const dockerExercise: Exercise = {
    ...exercise, codeLanguage: 'python', runtime: 'docker',
    files: [{ path: 'main.py', content: 'def double(n): return n' }],
    solutionFiles: [{ path: 'main.py', content: 'def double(n): return n * 2' }],
    testFiles: [{ path: 'tests.py', content: 'assert double(3) == 6' }],
    testCommand: 'python tests.py',
  }

  it('runs the same tests against the reference and starter files and reports build progress', async () => {
    fetchResponse
      .mockResolvedValueOnce(stream({ type: 'progress', message: 'Preparing Python' }, { type: 'done', data: pass }))
      .mockResolvedValueOnce(stream({ type: 'done', data: fail }))
    const onStage = vi.fn()

    await expect(verifyExercise(dockerExercise, 'Python', { onStage })).resolves.toMatchObject({
      status: 'verified', fixed: false, total: 1,
    })
    const requests = fetchResponse.mock.calls.map(([url, init]) => ({ url, payload: JSON.parse(String(init?.body)) }))
    expect(requests).toEqual([
      { url: '/api/sandbox/verify', payload: {
        language: 'python', files: [...dockerExercise.solutionFiles!, ...dockerExercise.testFiles!], testCommand: 'python tests.py',
      } },
      { url: '/api/sandbox/verify', payload: {
        language: 'python', files: [...dockerExercise.files!, ...dockerExercise.testFiles!], testCommand: 'python tests.py',
      } },
    ])
    expect(onStage).toHaveBeenCalledWith('building', 'Preparing Python')
    expect(onStage.mock.calls).toEqual([['validating'], ['building', 'Preparing Python'], ['validating']])
  })

  it('repairs failed container tests once and reuses files omitted from the repair', async () => {
    const repaired = [{ path: 'tests.py', content: 'assert double(4) == 8' }]
    fetchResponse
      .mockResolvedValueOnce(stream({ type: 'done', data: fail }))
      .mockResolvedValueOnce(stream({ type: 'done', data: fail }))
      .mockResolvedValueOnce(stream({ type: 'done', data: { testFiles: repaired, testCommand: ' python tests.py ' } }))
      .mockResolvedValueOnce(stream({ type: 'done', data: pass }))
      .mockResolvedValueOnce(stream({ type: 'done', data: fail }))

    const onStage = vi.fn()
    await expect(verifyExercise(dockerExercise, undefined, { onStage })).resolves.toMatchObject({
      status: 'verified', fixed: true, total: 1,
      patch: { files: dockerExercise.files, solutionFiles: dockerExercise.solutionFiles, testFiles: repaired, testCommand: 'python tests.py' },
    })
    expect(fetchResponse.mock.calls.map(([url]) => url)).toEqual([
      '/api/sandbox/verify', '/api/sandbox/verify', '/api/ai/fixTests', '/api/sandbox/verify', '/api/sandbox/verify',
    ])
    expect(onStage.mock.calls).toEqual([['validating'], ['validating'], ['fixing'], ['validating'], ['validating']])
  })

  it('makes infrastructure failures visible without asking the model to repair the exercise', async () => {
    fetchResponse.mockResolvedValueOnce(stream({ type: 'error', message: 'Docker is not running' }))

    await expect(verifyExercise(dockerExercise)).resolves.toEqual({ status: 'unverified', note: 'Docker is not running' })
    expect(fetchResponse).toHaveBeenCalledTimes(1)
  })

  it('stays unverified when a repair leaves the reference solution failing', async () => {
    fetchResponse
      .mockResolvedValueOnce(stream({ type: 'done', data: fail }))
      .mockResolvedValueOnce(stream({ type: 'done', data: fail }))
      .mockResolvedValueOnce(stream({ type: 'done', data: { note: 'Retried with the same files' } }))
      .mockResolvedValueOnce(stream({ type: 'done', data: fail }))
      .mockResolvedValueOnce(stream({ type: 'done', data: fail }))

    await expect(verifyExercise(dockerExercise)).resolves.toMatchObject({
      status: 'unverified', note: 'Retried with the same files',
    })
  })

  it('stays unverified when the model cannot repair container tests', async () => {
    fetchResponse
      .mockResolvedValueOnce(stream({ type: 'done', data: fail }))
      .mockResolvedValueOnce(stream({ type: 'done', data: fail }))
      .mockResolvedValueOnce(stream({ type: 'error', message: 'Provider unavailable' }))

    await expect(verifyExercise(dockerExercise)).resolves.toEqual({ status: 'unverified' })
  })
})
