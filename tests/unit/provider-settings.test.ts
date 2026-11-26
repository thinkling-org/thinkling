import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { effectScope } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useProviderSettings } from '../../src/composables/useProviderSettings.ts'
import { useApp } from '../../src/stores/app.ts'
import { ai } from '../../src/lib/api.ts'

vi.mock('../../src/lib/api.ts', () => ({ ai: vi.fn(), getJSON: vi.fn(), putJSON: vi.fn() }))
let pinia: ReturnType<typeof createPinia>
let scope: ReturnType<typeof effectScope>
let app: ReturnType<typeof useApp>

beforeEach(() => {
  pinia = createPinia(); setActivePinia(pinia); scope = effectScope()
  app = useApp()
  vi.spyOn(app, 'saveNow').mockResolvedValue(undefined)
  vi.spyOn(app, 'refreshStatus').mockResolvedValue(undefined)
  vi.mocked(ai).mockReset()
  vi.useFakeTimers()
})
afterEach(() => { scope.stop(); disposePinia(pinia); vi.restoreAllMocks(); vi.useRealTimers() })
const setup = () => scope.run(useProviderSettings)!

describe('AI provider settings', () => {
  it('saves provider changes before refreshing status and preserves provider preferences', async () => {
    const settings = setup()
    app.settings.model = 'sonnet'
    await settings.chooseProvider('codex')
    expect(app.settings.provider).toBe('codex')
    expect(app.settings.prefs.claude.model).toBe('sonnet')
    expect(app.saveNow).toHaveBeenCalledTimes(1)
    expect(app.refreshStatus).toHaveBeenCalledTimes(1)
    await settings.chooseProvider('codex')
    expect(app.saveNow).toHaveBeenCalledTimes(1)
  })

  it('tests saved settings and reports elapsed time', async () => {
    const settings = setup()
    vi.mocked(ai).mockImplementation(async () => { vi.setSystemTime(Date.now() + 1500); return { message: 'Connected' } as any })
    await settings.testConnection()
    expect(ai).toHaveBeenCalledWith('ping', {}, { signal: expect.any(AbortSignal) })
    expect(settings.testResult.value).toEqual({ ok: true, text: 'Connected (1.5 s)' })
    expect(settings.testing.value).toBe(false)
  })

  it('reports a save failure without contacting the provider', async () => {
    vi.mocked(app.saveNow).mockRejectedValue(new Error('Save failed'))
    const settings = setup()
    await settings.testConnection()
    expect(settings.testResult.value).toEqual({ ok: false, text: 'Save failed' })
    expect(ai).not.toHaveBeenCalled()
  })

  it('allows retry after a failed connection', async () => {
    const settings = setup()
    vi.mocked(ai).mockRejectedValueOnce(new Error('Not logged in')).mockResolvedValueOnce({ message: 'OK' })
    await settings.testConnection()
    expect(settings.testResult.value).toEqual({ ok: false, text: 'Not logged in' })
    await settings.testConnection()
    expect(settings.testResult.value.ok).toBe(true)
  })

  it('prevents duplicate tests and aborts pending requests when changing provider', async () => {
    let signal: AbortSignal
    let complete!: (value: unknown) => void
    vi.mocked(ai).mockImplementation((_kind, _body, options) => {
      signal = options.signal
      return new Promise((resolve) => { complete = resolve })
    })
    const settings = setup()
    const pending = settings.testConnection()
    await Promise.resolve(); await Promise.resolve()
    await settings.testConnection()
    expect(ai).toHaveBeenCalledTimes(1)
    await settings.chooseProvider('codex')
    expect(signal.aborted).toBe(true)
    complete({ message: 'Stale result' })
    await pending
    expect(settings.testResult.value).toBeNull()
  })

  it('cancels on disposal even while waiting for settings to save', async () => {
    let finishSave!: () => void
    vi.mocked(app.saveNow).mockReturnValueOnce(new Promise((resolve) => { finishSave = () => resolve(undefined) }))
    const settings = setup()
    const pending = settings.testConnection()
    scope.stop()
    finishSave()
    await pending
    expect(ai).not.toHaveBeenCalled()
    expect(settings.testing.value).toBe(false)
    expect(settings.testResult.value).toBeNull()
  })
})
