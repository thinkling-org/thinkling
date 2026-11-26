import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installedBlocks, installedPlugins, loadInstalledBlocks, pluginProblems, pluginState } from '../../src/blocks/installed.ts'
import type { InstalledPluginInfo } from '../../src/blocks/installed.ts'

const plugin = (changes: Partial<InstalledPluginInfo> = {}): InstalledPluginInfo => ({
  folder: 'example.counter', id: 'example/counter', version: '1.0.0', engine: '^1.0.0',
  name: 'Counter', summary: 'Count values', entry: '/plugins/example.counter/index.js', locales: {}, ...changes,
})
const module = () => ({ default: {
  normalize: (data) => data,
  describe: () => 'Counter',
  mount: () => ({ update() {}, unmount() {} }),
} })
const fetchList = vi.fn()
const importModule = vi.fn()

beforeEach(() => {
  installedBlocks.clear(); installedPlugins.splice(0); pluginProblems.splice(0)
  pluginState.ready = false; pluginState.restartRecommended = false
  fetchList.mockReset().mockResolvedValue({ plugins: [plugin()], errors: [] })
  importModule.mockReset().mockImplementation(async () => module())
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())
const reload = () => loadInstalledBlocks({ fetchList, importModule })

describe('installed block synchronization', () => {
  it('loads new plugins and reuses their definitions when the version is unchanged', async () => {
    await reload()
    const definition = installedBlocks.get('example/counter')
    expect(definition?.describe({})).toBe('Counter')
    expect(importModule).toHaveBeenCalledExactlyOnceWith('/plugins/example.counter/index.js?v=1.0.0')
    await loadInstalledBlocks()
    expect(importModule).toHaveBeenCalledTimes(1)
    expect(installedBlocks.get('example/counter')).toBe(definition)
    expect(pluginState).toMatchObject({ ready: true, restartRecommended: false })
  })

  it('updates a loaded plugin with a versioned URL and recommends restarting', async () => {
    await reload()
    fetchList.mockResolvedValue({ plugins: [plugin({ version: '2.0.0+build 1' })], errors: [] })
    await reload()
    expect(importModule).toHaveBeenLastCalledWith('/plugins/example.counter/index.js?v=2.0.0%2Bbuild%201')
    expect(installedBlocks.get('example/counter')?.version).toBe('2.0.0+build 1')
    expect(pluginState.restartRecommended).toBe(true)
  })

  it('removes disabled and uninstalled definitions while listing disabled plugins', async () => {
    fetchList.mockResolvedValueOnce({ plugins: [plugin(), plugin({ id: 'example/other' })], errors: [] })
    await reload()
    fetchList.mockResolvedValueOnce({ plugins: [plugin({ enabled: false })], errors: [] })
    await reload()
    expect(installedBlocks.size).toBe(0)
    expect(installedPlugins).toEqual([plugin({ enabled: false })])
    expect(importModule).toHaveBeenCalledTimes(2)
  })

  it('preserves the last working definition when its update fails and retries it later', async () => {
    await reload()
    const previous = installedBlocks.get('example/counter')
    fetchList.mockResolvedValue({ plugins: [plugin({ version: '2.0.0' })], errors: [] })
    importModule.mockRejectedValueOnce(new Error('Broken update'))
    await reload()
    expect(installedBlocks.get('example/counter')).toBe(previous)
    expect(pluginState.restartRecommended).toBe(false)
    expect(pluginProblems).toEqual([{ plugin: 'example/counter', folder: 'example.counter', error: 'Broken update' }])
    await reload()
    expect(installedBlocks.get('example/counter')?.version).toBe('2.0.0')
    expect(pluginProblems).toEqual([])
  })

  it('loads working plugins alongside catalog and module failures', async () => {
    fetchList.mockResolvedValue({ plugins: [plugin(), plugin({ id: 'example/broken', folder: 'broken', entry: '/broken.js' })], errors: [{ folder: 'invalid', error: 'Invalid manifest' }] })
    importModule.mockImplementation(async (url) => { if (url.startsWith('/broken')) throw 'Import failed'; return module() })
    await reload()
    expect([...installedBlocks.keys()]).toEqual(['example/counter'])
    expect(pluginProblems).toEqual([
      { plugin: 'invalid', folder: 'invalid', error: 'Invalid manifest' },
      { plugin: 'example/broken', folder: 'broken', error: 'Import failed' },
    ])
  })

  it('keeps the last catalog, definitions and diagnostics when listing fails', async () => {
    fetchList.mockResolvedValueOnce({ plugins: [plugin()], errors: [{ folder: 'invalid', error: 'Invalid manifest' }] })
    await reload()
    const previous = installedBlocks.get('example/counter')
    fetchList.mockRejectedValueOnce(new Error('Offline'))
    await expect(reload()).resolves.toBeUndefined()
    expect(installedBlocks.get('example/counter')).toBe(previous)
    expect(installedPlugins).toEqual([plugin()])
    expect(pluginProblems).toEqual([{ plugin: 'invalid', folder: 'invalid', error: 'Invalid manifest' }])
    expect(pluginState.ready).toBe(true)
  })
})
