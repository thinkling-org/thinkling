// @vitest-environment jsdom

import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DesktopUpdate from '../../src/components/DesktopUpdate.vue'
import type { DesktopUpdates, DesktopUpdateState } from '../../src/lib/desktop-updates.ts'
import { useDesktopUpdates } from '../../src/stores/updates.ts'
import { configureLocale } from '../../src/lib/i18n.ts'

let pinia: ReturnType<typeof createPinia>
let receive: (state: DesktopUpdateState) => void
let disconnect: () => void
let bridge: DesktopUpdates
const initial: DesktopUpdateState = { currentVersion: '0.1.0', status: 'idle' }

enableAutoUnmount(afterEach)
beforeEach(() => {
  pinia = createPinia()
  configureLocale(() => 'en')
  bridge = {
    getState: vi.fn().mockResolvedValue(initial),
    check: vi.fn().mockResolvedValue(initial),
    download: vi.fn().mockResolvedValue(initial),
    install: vi.fn().mockResolvedValue(initial),
    onState: vi.fn((listener) => { receive = listener; return vi.fn() }),
  }
  window.thinklingUpdates = bridge
  disconnect = useDesktopUpdates(pinia).connect()
})
afterEach(() => {
  disconnect()
  disposePinia(pinia)
  delete window.thinklingUpdates
  configureLocale(() => 'en')
  vi.restoreAllMocks()
})

function render(compact = false) {
  return mount(DesktopUpdate, { props: { compact }, global: { plugins: [pinia] } })
}
function emit(state: Partial<DesktopUpdateState>) {
  receive({ ...initial, ...state })
}

describe('desktop update controls', () => {
  it('stays hidden in a browser without a desktop bridge', async () => {
    disconnect()
    delete window.thinklingUpdates
    disposePinia(pinia)
    pinia = createPinia()
    disconnect = useDesktopUpdates(pinia).connect()
    const wrapper = render()
    await flushPromises()
    expect(wrapper.find('section').exists()).toBe(false)
  })

  it('downloads on click, shows progress, and waits for a separate restart click', async () => {
    const wrapper = render(true)
    await flushPromises()
    expect(wrapper.find('button').exists()).toBe(false)
    emit({ status: 'available', availableVersion: '0.2.0' })
    await flushPromises()
    expect(wrapper.get('button').text()).toContain('Update available · 0.2.0')
    expect(bridge.download).not.toHaveBeenCalled()
    await wrapper.get('button').trigger('click')
    expect(bridge.download).toHaveBeenCalledOnce()
    emit({ status: 'downloading', percent: 42 })
    await flushPromises()
    expect(wrapper.get('button').element.disabled).toBe(true)
    expect(wrapper.get('progress').attributes('value')).toBe('42')
    emit({ status: 'downloaded', availableVersion: '0.2.0' })
    await flushPromises()
    expect(bridge.install).not.toHaveBeenCalled()
    expect(wrapper.get('button').text()).toContain('Restart and update')
    await wrapper.get('button').trigger('click')
    expect(bridge.install).toHaveBeenCalledOnce()
  })

  it('shows the version, manual check and release notes in settings', async () => {
    const wrapper = render()
    await flushPromises()
    expect(wrapper.text()).toContain('Thinkling 0.1.0')
    expect(wrapper.get('a').attributes('href')).toBe('https://github.com/codenoms-org/thinkling/releases')
    await wrapper.get('button').trigger('click')
    expect(bridge.check).toHaveBeenCalledOnce()
    emit({ status: 'current' })
    await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toBe('You are using the latest version.')
  })

  it('retries the failed action and translates its feedback to Polish', async () => {
    configureLocale(() => 'pl')
    const wrapper = render()
    emit({ status: 'error', retry: 'download', availableVersion: '0.2.0' })
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('Nie udało się pobrać aktualizacji')
    await wrapper.get('button').trigger('click')
    expect(bridge.download).toHaveBeenCalledOnce()
    expect(bridge.check).not.toHaveBeenCalled()
    emit({ status: 'downloaded', availableVersion: '0.2.0' })
    await flushPromises()
    expect(wrapper.get('button').text()).toContain('Uruchom ponownie i zaktualizuj')
  })

  it('does not overwrite a newer event with a delayed initial snapshot', async () => {
    disconnect()
    const snapshot = Promise.withResolvers<DesktopUpdateState>()
    vi.mocked(bridge.getState).mockReturnValue(snapshot.promise)
    disconnect = useDesktopUpdates(pinia).connect()
    const wrapper = render()
    emit({ status: 'available', availableVersion: '0.2.0' })
    snapshot.resolve(initial)
    await flushPromises()
    expect(wrapper.get('button').text()).toContain('Update available · 0.2.0')
  })

  it('disables updates in development and unsubscribes when the owner unmounts', async () => {
    const unsubscribe = vi.mocked(bridge.onState).mock.results[0].value
    const wrapper = render()
    emit({ status: 'disabled' })
    await flushPromises()
    expect(wrapper.find('button').exists()).toBe(false)
    expect(wrapper.text()).toContain('installed Windows application')
    disconnect()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})
