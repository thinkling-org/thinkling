import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mergeFiles, sandbox, terminalUrl, wsIdFor } from '../../src/lib/sandbox.ts'

const fetchMock = vi.fn<typeof fetch>()
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock) })
afterEach(() => vi.unstubAllGlobals())

describe('sandbox HTTP client', () => {
  it('loads status, file listings and filenames with reserved URL characters', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ available: true }))
      .mockResolvedValueOnce(Response.json([{ path: 'main.py' }]))
      .mockResolvedValueOnce(Response.json({ content: 'answer = 42', mtime: 1 }))
    expect(await sandbox.status()).toEqual({ available: true })
    expect(await sandbox.files('lesson')).toEqual([{ path: 'main.py' }])
    expect(await sandbox.read('lesson', 'src/a & b.py')).toEqual({ content: 'answer = 42', mtime: 1 })
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/sandbox/lesson/file?path=src%2Fa%20%26%20b.py')
  })

  it('uses POST for file creation and PUT for edits', async () => {
    fetchMock.mockImplementation(async () => Response.json({ mtime: 2 }))
    await expect(sandbox.create('lesson', 'main.py')).resolves.toEqual({ mtime: 2 })
    await expect(sandbox.write('lesson', 'main.py', 'answer = 42')).resolves.toEqual({ mtime: 2 })
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/sandbox/lesson/file', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"path":"main.py"}' })
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/sandbox/lesson/file', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"path":"main.py","content":"answer = 42"}' })
  })

  it('passes commands and the optional result parser flag', async () => {
    fetchMock.mockImplementation(async () => Response.json({ results: [] }))
    await sandbox.run('lesson', 'python main.py')
    await sandbox.run('lesson', 'pytest', { parse: true })
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/sandbox/lesson/run', expect.objectContaining({ body: '{"cmd":"python main.py","parse":false}' }))
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/sandbox/lesson/run', expect.objectContaining({ body: '{"cmd":"pytest","parse":true}' }))
  })

  it('forwards opening progress and the reset flag', async () => {
    fetchMock.mockResolvedValue(new Response('{"type":"progress","message":"Building image"}\n{"type":"done","data":{"env":"Python","files":[]}}\n'))
    const progress = vi.fn()
    expect(await sandbox.open('lesson', 'python', [], { reset: true, onProgress: progress })).toEqual({ env: 'Python', files: [] })
    expect(progress).toHaveBeenCalledWith('Building image')
    expect(fetchMock).toHaveBeenCalledWith('/api/sandbox/open', expect.objectContaining({ body: '{"wsId":"lesson","language":"python","files":[],"reset":true}' }))
  })

  it('verifies reference solutions through the streaming endpoint without requiring a progress listener', async () => {
    fetchMock.mockResolvedValue(new Response('{"type":"progress","message":"Verifying"}\n{"type":"done","data":{"results":[{"name":"works","ok":true}]}}\n'))
    expect(await sandbox.verify({ language: 'python', files: [], testCommand: 'pytest' })).toEqual({ results: [{ name: 'works', ok: true }] })
    expect(fetchMock).toHaveBeenCalledWith('/api/sandbox/verify', expect.objectContaining({ method: 'POST' }))
  })

  it('preserves server error messages and falls back to status for a non-JSON error', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: 'File already exists' }, { status: 409 }))
      .mockResolvedValueOnce(new Response('Bad gateway', { status: 502 }))
    await expect(sandbox.create('lesson', 'main.py')).rejects.toThrow('File already exists')
    await expect(sandbox.run('lesson', 'pytest')).rejects.toThrow('502')
  })
})

describe('sandbox workspace identity and file overlays', () => {
  it('sanitizes and bounds workspace IDs', () => {
    expect(wsIdFor('lesson/../name?# with spaces')).toBe('lesson____name___with_spaces')
    expect(wsIdFor('a'.repeat(100))).toHaveLength(80)
    expect(wsIdFor(42)).toBe('42')
  })

  it('merges file replacements in order without mutating the original files', () => {
    const base = [{ path: 'main.py', content: 'starter' }, { path: 'helper.py', content: 'helper' }]
    expect(mergeFiles(base, undefined, [{ path: 'main.py', content: 'solution' }], [{ path: 'test.py', content: 'tests' }])).toEqual([
      { path: 'main.py', content: 'solution' }, { path: 'helper.py', content: 'helper' }, { path: 'test.py', content: 'tests' },
    ])
    expect(base[0].content).toBe('starter')
    expect(mergeFiles(undefined)).toEqual([])
  })

  it.each([['https:', 'wss'], ['http:', 'ws']])('uses the correct WebSocket protocol for %s', (protocol, expected) => {
    vi.stubGlobal('location', { protocol, host: 'localhost:3141' })
    expect(terminalUrl('lesson')).toBe(`${expected}://localhost:3141/api/sandbox/lesson/term`)
  })
})
