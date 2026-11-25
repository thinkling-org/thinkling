// @vitest-environment jsdom

import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AskDrawer from '../../src/components/AskDrawer.vue'
import { configureLocale } from '../../src/lib/i18n.ts'

const { ai } = vi.hoisted(() => ({ ai: vi.fn() }))
vi.mock('../../src/lib/api.ts', () => ({ ai, getJSON: vi.fn(), putJSON: vi.fn() }))
vi.mock('../../src/lib/sfx.ts', () => ({ play: vi.fn() }))

let pinia: ReturnType<typeof createPinia>
enableAutoUnmount(afterEach)
beforeEach(() => {
  pinia = createPinia()
  ai.mockReset().mockResolvedValue('Check the module path in go.mod.')
  configureLocale(() => 'en')
})
afterEach(() => {
  disposePinia(pinia)
  configureLocale(() => 'en')
})

function render(loadContext: () => Promise<string>) {
  return mount(AskDrawer, { props: { open: true, context: 'Old context', loadContext }, global: { plugins: [pinia] } })
}

describe('tutor workspace context', () => {
  it('waits for saved workspace contents and loads them again for each question', async () => {
    const snapshot = Promise.withResolvers<string>()
    const loadContext = vi.fn().mockReturnValueOnce(snapshot.promise).mockResolvedValueOnce('Updated main.go')
    const wrapper = render(loadContext)
    await wrapper.get('textarea').setValue('Why do my tests fail?')
    await wrapper.get('form').trigger('submit')
    expect(ai).not.toHaveBeenCalled()
    expect(wrapper.get<HTMLTextAreaElement>('textarea').element.disabled).toBe(true)
    snapshot.resolve('Current main.go and go.mod, failed module test')
    await flushPromises()
    expect(ai).toHaveBeenLastCalledWith('chat', expect.objectContaining({
      context: 'Current main.go and go.mod, failed module test', question: 'Why do my tests fail?',
    }), expect.any(Object))

    await wrapper.get('textarea').setValue('And now?')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(loadContext).toHaveBeenCalledTimes(2)
    expect(ai).toHaveBeenLastCalledWith('chat', expect.objectContaining({ context: 'Updated main.go', question: 'And now?' }), expect.any(Object))
  })

  it('shows a workspace error instead of sending empty or stale code to the tutor', async () => {
    const wrapper = render(vi.fn().mockRejectedValue(new Error('Could not save main.go')))
    await wrapper.get('textarea').setValue('Check my code')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(ai).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Could not save main.go')
    expect(wrapper.get<HTMLTextAreaElement>('textarea').element.disabled).toBe(false)
  })

  it('does not send a pending snapshot after the learner changes exercises', async () => {
    const snapshot = Promise.withResolvers<string>()
    const wrapper = render(() => snapshot.promise)
    await wrapper.get('textarea').setValue('Check this exercise')
    await wrapper.get('form').trigger('submit')
    wrapper.vm.reset()
    snapshot.resolve('The exercise the learner has left')
    await flushPromises()
    expect(ai).not.toHaveBeenCalled()
    expect(wrapper.text()).not.toContain('The exercise the learner has left')
  })
})
