// @vitest-environment jsdom

import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import UpdatePrompt from '../../src/components/UpdatePrompt.vue'
import { useDesktopUpdates } from '../../src/stores/updates.ts'
import { configureLocale } from '../../src/lib/i18n.ts'
import type { DesktopUpdateState, DesktopUpdates } from '../../src/lib/desktop-updates.ts'

const initial: DesktopUpdateState = { status: 'idle', currentVersion: '0.1.2' }
let pinia: ReturnType<typeof createPinia>
let bridge: DesktopUpdates
let receive: (state: DesktopUpdateState) => void
let disconnect: () => void
const nativeDialog = {
  showModal: Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal'),
  close: Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close'),
}

enableAutoUnmount(afterEach)
beforeEach(() => {
  pinia = createPinia()
  configureLocale(() => 'pl')
  // jsdom has no native top layer. Exercise our visibility/events here; Electron tests focus and modality.
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', '') } },
    close: { configurable: true, value: function (this: HTMLDialogElement) {
      this.removeAttribute('open')
      this.dispatchEvent(new Event('close'))
    } },
  })
  bridge = {
    getState: vi.fn().mockResolvedValue(initial),
    check: vi.fn().mockResolvedValue(initial),
    download: vi.fn().mockResolvedValue(initial),
    install: vi.fn().mockResolvedValue(initial),
    dismissPrompt: vi.fn().mockResolvedValue(initial),
    onState: vi.fn((listener) => { receive = listener; return () => {} }),
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
  for (const key of ['showModal', 'close'] as const) {
    if (nativeDialog[key]) Object.defineProperty(HTMLDialogElement.prototype, key, nativeDialog[key])
    else Reflect.deleteProperty(HTMLDialogElement.prototype, key)
  }
})

function render() {
  return mount(UpdatePrompt, { global: { plugins: [pinia] } })
}
function available(promptAtStartup = true) {
  receive({ ...initial, status: 'available', availableVersion: '0.2.0', promptAtStartup })
}

describe('startup update prompt', () => {
  it('opens for a startup update, shows its version in Polish and waits for a click', async () => {
    const wrapper = render()
    await flushPromises()
    expect(wrapper.get('dialog').element.open).toBe(false)
    available()
    await flushPromises()
    expect(wrapper.get('dialog').element.open).toBe(true)
    expect(wrapper.get('h2').text()).toBe('Dostępna aktualizacja')
    expect(wrapper.text()).toContain('Thinkling 0.2.0')
    expect(wrapper.get('.prompt-download').text()).toBe('Pobierz aktualizację')
    expect(bridge.download).not.toHaveBeenCalled()
    expect(bridge.install).not.toHaveBeenCalled()
  })

  it('dismisses with Later and does not reopen after navigation or repeated events', async () => {
    const wrapper = render()
    available()
    await flushPromises()
    await wrapper.get('.prompt-later').trigger('click')
    expect(wrapper.get('dialog').element.open).toBe(false)
    expect(bridge.download).not.toHaveBeenCalled()
    wrapper.unmount()
    expect(bridge.dismissPrompt).toHaveBeenCalledOnce()
    const remounted = render()
    available()
    await flushPromises()
    expect(remounted.get('dialog').element.open).toBe(false)
  })

  it('supports Escape through the native dialog cancel event', async () => {
    const wrapper = render()
    available()
    await flushPromises()
    await wrapper.get('dialog').trigger('cancel')
    expect(wrapper.get('dialog').element.open).toBe(false)
    expect(useDesktopUpdates(pinia).showStartupPrompt).toBe(false)
  })

  it('starts downloading in the background and closes without installing', async () => {
    const wrapper = render()
    available()
    await flushPromises()
    await wrapper.get('.prompt-download').trigger('click')
    await flushPromises()
    expect(bridge.download).toHaveBeenCalledOnce()
    expect(wrapper.get('dialog').element.open).toBe(false)
    expect(bridge.install).not.toHaveBeenCalled()
  })

  it('does not interrupt the user for manual checks, periodic checks, errors or the current version', async () => {
    const wrapper = render()
    available(false)
    await flushPromises()
    expect(wrapper.get('dialog').element.open).toBe(false)
    receive({ ...initial, status: 'error', retry: 'check' })
    await flushPromises()
    expect(wrapper.get('dialog').element.open).toBe(false)
    receive({ ...initial, status: 'current' })
    await flushPromises()
    expect(wrapper.get('dialog').element.open).toBe(false)
  })

  it('opens when startup discovery completes before the UI subscribes', async () => {
    disconnect()
    vi.mocked(bridge.getState).mockResolvedValue({ ...initial, status: 'available', availableVersion: '0.2.0', promptAtStartup: true })
    disconnect = useDesktopUpdates(pinia).connect()
    await flushPromises()
    const wrapper = render()
    await flushPromises()
    expect(wrapper.get('dialog').element.open).toBe(true)
  })
})
