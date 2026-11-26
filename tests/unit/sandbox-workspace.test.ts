// @vitest-environment jsdom

import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSandboxWorkspace } from '../../src/composables/useSandboxWorkspace.ts'
import { sandbox } from '../../src/lib/sandbox.ts'
import { deferred, mountComposable } from '../helpers/vue.ts'

vi.mock('../../src/lib/sandbox.ts', () => ({ sandbox: {
  open: vi.fn(), files: vi.fn(), read: vi.fn(), write: vi.fn(), create: vi.fn(),
} }))
enableAutoUnmount(afterEach)

const entry = (path = 'main.py', mtime = 1, size = 10) => ({ path, dir: false, mtime, size })
const options = { wsId: 'lesson', language: 'python', seedFiles: [], mainFile: 'main.py', testPaths: ['checks.py'], envLabel: 'Python' }

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.mocked(sandbox.open).mockResolvedValue({ env: 'Python 3.12', files: [entry()] })
  vi.mocked(sandbox.files).mockResolvedValue([entry()])
  vi.mocked(sandbox.read).mockResolvedValue({ content: 'original', mtime: 1 })
  vi.mocked(sandbox.write).mockResolvedValue({ mtime: 2 })
  vi.mocked(sandbox.create).mockResolvedValue({ mtime: 1 })
})
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })

async function open() {
  const mounted = mountComposable(() => useSandboxWorkspace(options))
  await flushPromises()
  return { ws: mounted.result, wrapper: mounted.wrapper }
}

describe('sandbox workspace lifecycle and persistence', () => {
  it('opens the main file, reports the environment and reuses open tabs', async () => {
    const { ws } = await open()
    expect(ws.phase.value).toBe('ready')
    expect(ws.environment.value).toBe('Python 3.12')
    expect(ws.active.value).toBe('main.py')
    expect(ws.activeFile.value).toMatchObject({ content: 'original', dirty: false })
    await ws.openFile('main.py')
    expect(sandbox.read).toHaveBeenCalledTimes(1)
    expect(ws.tabs.value).toEqual(['main.py'])
  })

  it('chooses a non-test file when the main file is missing', async () => {
    vi.mocked(sandbox.open).mockResolvedValue({ env: 'Python', files: [entry('tests/unit.py'), entry('app.py')] })
    const { ws } = await open()
    expect(ws.active.value).toBe('app.py')
    expect(ws.isTest('checks.py')).toBe(true)
    expect(ws.isTest('test/example.py')).toBe(true)
  })

  it('shows an open error and supports retrying', async () => {
    vi.mocked(sandbox.open).mockRejectedValueOnce(new Error('Docker unavailable'))
    const { ws } = await open()
    expect(ws.phase.value).toBe('error')
    expect(ws.error.value).toBe('Docker unavailable')
    await ws.open()
    expect(ws.phase.value).toBe('ready')
    expect(ws.error.value).toBe('')
  })

  it('debounces edits and never saves an unchanged or missing file', async () => {
    const { ws } = await open()
    ws.edit('missing.py', 'no')
    ws.edit('main.py', 'original')
    await vi.advanceTimersByTimeAsync(500)
    expect(sandbox.write).not.toHaveBeenCalled()
    ws.edit('main.py', 'first')
    await vi.advanceTimersByTimeAsync(400)
    ws.edit('main.py', 'latest')
    await vi.advanceTimersByTimeAsync(499)
    expect(sandbox.write).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(sandbox.write).toHaveBeenCalledExactlyOnceWith('lesson', 'main.py', 'latest')
    expect(ws.activeFile.value).toMatchObject({ content: 'latest', dirty: false, mtime: 2 })
  })

  it('serializes writes so an older save cannot discard a newer edit', async () => {
    const { ws } = await open()
    const first = deferred<{ mtime: number }>()
    vi.mocked(sandbox.write).mockReturnValueOnce(first.promise)
    ws.edit('main.py', 'first')
    const saving = ws.save('main.py')
    ws.edit('main.py', 'second')
    const flushing = ws.flush()
    expect(sandbox.write).toHaveBeenCalledTimes(1)
    first.resolve({ mtime: 2 })
    await Promise.all([saving, flushing])
    expect(sandbox.write).toHaveBeenLastCalledWith('lesson', 'main.py', 'second')
    expect(ws.activeFile.value).toMatchObject({ content: 'second', dirty: false })
  })

  it('retains unsaved content after a failure and clears the error after retry', async () => {
    const { ws } = await open()
    vi.mocked(sandbox.write).mockRejectedValueOnce(new Error('Disk full'))
    ws.edit('main.py', 'valuable work')
    await vi.advanceTimersByTimeAsync(500)
    expect(ws.saveError.value).toBe('Disk full')
    expect(ws.activeFile.value).toMatchObject({ dirty: true, content: 'valuable work' })
    await ws.flush()
    expect(ws.saveError.value).toBe('')
    expect(ws.activeFile.value.dirty).toBe(false)
  })

  it('saves a dirty tab when closing it and activates the remaining tab', async () => {
    const { ws } = await open()
    await ws.openFile('helper.py')
    ws.edit('helper.py', 'changed')
    ws.closeTab('helper.py')
    await flushPromises()
    expect(ws.tabs.value).toEqual(['main.py'])
    expect(ws.active.value).toBe('main.py')
    expect(sandbox.write).toHaveBeenCalledWith('lesson', 'helper.py', 'changed')
    ws.closeTab('main.py')
    expect(ws.active.value).toBe('')
  })

  it('reloads externally changed files while preserving local dirty buffers', async () => {
    const { ws } = await open()
    vi.mocked(sandbox.files).mockResolvedValue([entry('main.py', 5)])
    vi.mocked(sandbox.read).mockResolvedValue({ content: 'external', mtime: 5 })
    await ws.refresh()
    expect(ws.activeFile.value.content).toBe('external')
    ws.edit('main.py', 'local')
    await ws.refresh()
    expect(ws.activeFile.value.content).toBe('local')
    expect(sandbox.read).toHaveBeenCalledTimes(2)
  })

  it('does not overwrite an edit made while an external file read is in flight', async () => {
    const { ws } = await open()
    const reading = deferred<{ content: string; mtime: number }>()
    vi.mocked(sandbox.files).mockResolvedValue([entry('main.py', 5)])
    vi.mocked(sandbox.read).mockReturnValueOnce(reading.promise)
    const refreshing = ws.refresh()
    await flushPromises()
    ws.edit('main.py', 'local')
    reading.resolve({ content: 'external', mtime: 5 })
    await refreshing
    expect(ws.activeFile.value.content).toBe('local')
  })

  it('retries polling after a transient container failure', async () => {
    const { ws } = await open()
    vi.mocked(sandbox.files).mockRejectedValueOnce(new Error('Disconnected'))
    await vi.advanceTimersByTimeAsync(5000)
    expect(sandbox.files).toHaveBeenCalledTimes(2)
    expect(ws.phase.value).toBe('ready')
  })

  it('waits for outstanding writes before resetting the workspace', async () => {
    const { ws } = await open()
    const writing = deferred<{ mtime: number }>()
    vi.mocked(sandbox.write).mockReturnValueOnce(writing.promise)
    ws.edit('main.py', 'first')
    const save = ws.save('main.py')
    ws.edit('main.py', 'discard on reset')
    const reset = ws.open(true)
    expect(sandbox.open).toHaveBeenCalledTimes(1)
    writing.resolve({ mtime: 2 })
    await Promise.all([save, reset])
    expect(sandbox.open).toHaveBeenLastCalledWith('lesson', 'python', [], expect.objectContaining({ reset: true }))
    expect(ws.activeFile.value).toMatchObject({ content: 'original', dirty: false })
    expect(sandbox.write).toHaveBeenCalledTimes(1)
  })

  it('normalizes new paths, refreshes the tree and opens the created file', async () => {
    const { ws } = await open()
    vi.mocked(sandbox.files).mockResolvedValue([entry(), entry('src/helper.py')])
    await ws.createFile(' src\\helper.py ')
    expect(sandbox.create).toHaveBeenCalledWith('lesson', 'src/helper.py')
    expect(ws.active.value).toBe('src/helper.py')
  })

  it('flushes edits before collecting user files, excluding tests, folders and large files', async () => {
    const { ws } = await open()
    vi.mocked(sandbox.files).mockResolvedValue([entry(), entry('helper.py'), entry('checks.py'), entry('tests/test.py'), entry('large.bin', 1, 60_000), { ...entry('folder'), dir: true }])
    await ws.refresh()
    ws.edit('main.py', 'edited')
    expect(await ws.userFiles()).toEqual([{ path: 'main.py', content: 'edited' }, { path: 'helper.py', content: 'original' }])
    expect(sandbox.write).toHaveBeenCalledWith('lesson', 'main.py', 'edited')
  })

  it('stops collecting files once the total content budget is exhausted', async () => {
    const { ws } = await open()
    vi.mocked(sandbox.files).mockResolvedValue([entry('a.py'), entry('b.py'), entry('c.py')])
    vi.mocked(sandbox.read).mockResolvedValue({ content: 'x'.repeat(50_000), mtime: 1 })
    await ws.refresh()
    expect((await ws.userFiles()).map((file) => file.path)).toEqual(['a.py', 'b.py'])
  })

  it('flushes on unmount, stops polling and ignores late opening results', async () => {
    const { ws, wrapper } = await open()
    ws.edit('main.py', 'last edit')
    wrapper.unmount()
    await flushPromises()
    expect(sandbox.write).toHaveBeenCalledWith('lesson', 'main.py', 'last edit')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(sandbox.files).not.toHaveBeenCalled()

    const opening = deferred<Awaited<ReturnType<typeof sandbox.open>>>()
    vi.mocked(sandbox.open).mockReturnValueOnce(opening.promise)
    const late = mountComposable(() => useSandboxWorkspace(options))
    late.wrapper.unmount()
    opening.resolve({ env: 'Late', files: [entry()] })
    await flushPromises()
    expect(late.result.environment.value).toBe('Python')
    expect(late.result.tabs.value).toEqual([])
  })
})
