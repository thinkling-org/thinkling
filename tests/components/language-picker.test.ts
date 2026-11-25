// @vitest-environment jsdom

import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LanguagePicker from '../../src/components/LanguagePicker.vue'
import { configureLocale } from '../../src/lib/i18n.ts'
import { useApp } from '../../src/stores/app.ts'

const fetchResponse = vi.fn<typeof fetch>()
let pinia: ReturnType<typeof createPinia>
let app: ReturnType<typeof useApp>

enableAutoUnmount(afterEach)

beforeEach(() => {
  pinia = createPinia()
  app = useApp(pinia)
  app.settings.locale = 'en'
  configureLocale(() => app.settings.locale)
  fetchResponse.mockReset()
  vi.stubGlobal('fetch', fetchResponse)
})

afterEach(() => {
  disposePinia(pinia)
  configureLocale(() => 'en')
  vi.unstubAllGlobals()
})

function mountPicker(explain = false) {
  return mount(LanguagePicker, { props: { explain }, global: { plugins: [pinia] } })
}

describe('LanguagePicker', () => {
  it('uses the Polish option and label for a regional Polish locale', () => {
    app.settings.locale = 'pl-PL'
    const wrapper = mountPicker()

    expect(wrapper.get('label').text()).toContain('Język')
    expect(wrapper.get('select').element.value).toBe('pl')
    expect(wrapper.find('p').exists()).toBe(false)
  })

  it('shows a detected language even when the interface falls back to English', () => {
    app.settings.locale = 'fr-CA'
    const wrapper = mountPicker(true)

    expect(wrapper.get('select').element.value).toBe('fr-CA')
    expect(wrapper.get('option[value="fr-CA"]').text()).toBe('Canadian French')
    expect(wrapper.text()).toContain('The interface is displayed in English for this language.')
  })

  it('disables selection while saving and displays the new language after success', async () => {
    const save = Promise.withResolvers<Response>()
    fetchResponse.mockReturnValue(save.promise)
    const wrapper = mountPicker(true)
    const select = wrapper.get('select')

    await select.setValue('pl')
    expect(select.element.disabled).toBe(true)

    save.resolve(Response.json({ ok: true }))
    await flushPromises()

    expect(select.element.disabled).toBe(false)
    expect(select.element.value).toBe('pl')
    expect(wrapper.get('label').text()).toContain('Język')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('restores the previous selection and shows an alert after a failed save', async () => {
    fetchResponse.mockResolvedValue(new Response('Read-only storage', { status: 503 }))
    const wrapper = mountPicker()
    const select = wrapper.get('select')

    await select.setValue('pl')
    await flushPromises()

    expect(select.element.disabled).toBe(false)
    expect(select.element.value).toBe('en')
    expect(wrapper.get('[role="alert"]').text()).toBe("Couldn't save the language. Try again.")
  })
})
