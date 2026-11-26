// @vitest-environment jsdom

import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ModelPicker from '../../src/components/ModelPicker.vue'
import { useApp } from '../../src/stores/app.ts'
import { deferred } from '../helpers/vue.ts'

enableAutoUnmount(afterEach)
let pinia: ReturnType<typeof createPinia>
let app: ReturnType<typeof useApp>
const fetchMock = vi.fn<typeof fetch>()
const catalog = { defaultLabel: 'Provider default', efforts: [{ id: 'high', label: 'High' }], models: [
  { id: 'fast', label: 'Fast model', description: 'Quick responses', efforts: [{ id: 'low', label: 'Low' }], defaultEffort: 'low' },
  { id: 'deep', label: 'Deep model', efforts: [{ id: 'high', label: 'High' }] },
] }

beforeEach(() => {
  pinia = createPinia(); app = useApp(pinia)
  vi.spyOn(app, 'saveNow').mockResolvedValue(undefined)
  vi.spyOn(app, 'flushSave').mockResolvedValue(undefined)
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset().mockResolvedValue(Response.json(catalog))
})
afterEach(() => { disposePinia(pinia); vi.restoreAllMocks(); vi.unstubAllGlobals() })
async function render() { const wrapper = mount(ModelPicker, { global: { plugins: [pinia] } }); await flushPromises(); return wrapper }

describe('model and effort selection', () => {
  it('loads the catalog and clears an effort unsupported by the new model', async () => {
    app.settings.effort = 'high'
    const wrapper = await render()
    expect(fetchMock).toHaveBeenCalledWith('/api/providers/claude/models')
    await wrapper.findAll('button').find((button) => button.text() === 'Fast model')!.trigger('click')
    expect(app.settings.model).toBe('fast')
    expect(app.settings.effort).toBe('')
    expect(wrapper.text()).toContain('Quick responses')
    expect(wrapper.text()).toContain('Default (low)')
    await wrapper.findAll('button').find((button) => button.text() === 'Low')!.trigger('click')
    expect(app.settings.effort).toBe('low')
    expect(app.saveNow).toHaveBeenCalledTimes(2)
  })

  it('accepts a trimmed custom model ID and restores the CLI default', async () => {
    app.settings.model = 'custom-model'
    const wrapper = await render()
    expect(wrapper.get('details').attributes('open')).toBeDefined()
    const input = wrapper.get<HTMLInputElement>('input')
    expect(input.element.value).toBe('custom-model')
    await input.setValue('  new-model  ')
    await input.trigger('keydown', { key: 'Enter' })
    expect(app.settings.model).toBe('new-model')
    await wrapper.findAll('button').find((button) => button.text() === 'Provider default')!.trigger('click')
    expect(app.settings.model).toBe('')
  })

  it('offers manual entry if fetching the catalog fails', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Offline'))
    const wrapper = await render()
    expect(wrapper.text()).toContain("Couldn't load the model list.")
    await wrapper.get('input').setValue('manual-model')
    await wrapper.get('.custom button').trigger('click')
    expect(app.settings.model).toBe('manual-model')
  })

  it('ignores an old provider response after switching providers', async () => {
    const old = deferred<Response>()
    fetchMock.mockReturnValueOnce(old.promise)
    const wrapper = mount(ModelPicker, { global: { plugins: [pinia] } })
    await flushPromises()
    app.switchProvider('codex')
    fetchMock.mockResolvedValueOnce(Response.json({ models: [{ id: 'codex', label: 'Codex model' }] }))
    await flushPromises()
    old.resolve(Response.json(catalog))
    await flushPromises()
    expect(wrapper.text()).toContain('Codex model')
    expect(wrapper.text()).not.toContain('Fast model')
  })

  it('reloads localized model descriptions when the locale changes', async () => {
    const wrapper = await render()
    fetchMock.mockResolvedValueOnce(Response.json({ ...catalog, defaultLabel: 'Domyślny model' }))
    app.settings.locale = 'pl'
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('Domyślny model')
  })
})
