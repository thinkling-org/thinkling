import { defineStore } from 'pinia'
import { readonly, shallowRef } from 'vue'
import type { DesktopUpdateState, UpdateAction } from '../lib/desktop-updates.ts'

export const useDesktopUpdates = defineStore('desktop-updates', () => {
  const state = shallowRef<DesktopUpdateState | null>(null)
  const pending = shallowRef(false)

  function connect() {
    const bridge = window.thinklingUpdates
    if (!bridge) return () => {}
    let active = true
    let receivedEvent = false
    const unsubscribe = bridge.onState((next) => {
      receivedEvent = true
      if (active) state.value = next
    })
    bridge.getState().then((initial) => {
      if (active && !receivedEvent) state.value = initial
    }).catch(console.error)
    return () => { active = false; unsubscribe() }
  }

  async function act(action: UpdateAction) {
    const bridge = window.thinklingUpdates
    if (!bridge || pending.value) return
    pending.value = true
    try {
      await bridge[action]()
    } catch (error) {
      console.error('Could not contact the desktop updater', error)
      if (state.value) state.value = { ...state.value, status: 'error', retry: action }
    } finally {
      pending.value = false
    }
  }

  return { state: readonly(state), pending: readonly(pending), connect, act }
})
