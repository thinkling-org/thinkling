// @vitest-environment jsdom

import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import ExerciseFooter from '../../src/components/exercises/ExerciseFooter.vue'

enableAutoUnmount(afterEach)
const exercise = { id: 'practice', type: 'code', stage: 'practice', prompt: 'Complete a small fragment.' }

function render(status = 'correct') {
  return mount(ExerciseFooter, { props: {
    exercise, providerName: 'Claude',
    result: { status, data: { summary: 'This part works. Try a similar task next.' } },
  }, attachTo: document.body })
}

describe('compact exercise footer', () => {
  it('shows one main action and a single success message, keeping optional actions in a closed disclosure', () => {
    const wrapper = render()
    expect(wrapper.get('.actions').findAll('button')).toHaveLength(1)
    expect(wrapper.get('.actions button').text()).toBe('Continue')
    expect(wrapper.get('.msg').text()).toBe('This part works')
    expect(wrapper.find('.msg .m').exists()).toBe(false)
    expect(wrapper.get<HTMLDetailsElement>('.more').element.open).toBe(false)
    expect(wrapper.get('.content').text()).toContain('Go back')
  })

  it('keeps optional actions functional and closes the menu after selecting one', async () => {
    const wrapper = render()
    const disclosure = wrapper.get<HTMLDetailsElement>('.more').element
    disclosure.open = true
    const ask = wrapper.findAll('.more-panel button').find((button) => button.text() === 'Ask a follow-up')!
    await ask.trigger('click')
    expect(wrapper.emitted('ask')).toHaveLength(1)
    expect(disclosure.open).toBe(false)
  })

  it('closes with Escape, outside clicks and when the exercise changes', async () => {
    const wrapper = render()
    const disclosure = wrapper.get<HTMLDetailsElement>('.more').element
    disclosure.open = true
    await wrapper.get('.more').trigger('keydown', { key: 'Escape' })
    expect(disclosure.open).toBe(false)
    disclosure.open = true
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(disclosure.open).toBe(false)
    disclosure.open = true
    await wrapper.setProps({ exercise: { ...exercise, id: 'next' } })
    await flushPromises()
    expect(wrapper.get<HTMLDetailsElement>('.more').element.open).toBe(false)
  })

  it('offers retry as the main action when checking fails', async () => {
    const wrapper = render('error')
    expect(wrapper.get('.actions button').text()).toBe('Try again')
    await wrapper.get('.actions button').trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
    expect(wrapper.emitted('next')).toBeUndefined()
  })
})
