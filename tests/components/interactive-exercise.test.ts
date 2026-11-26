// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import InteractiveExercise from '../../src/components/exercises/InteractiveExercise.vue'
import { pluginState } from '../../src/blocks/installed.ts'
import type { Exercise } from '../../src/domain.ts'

const exercise: Exercise = {
  id: 'order', type: 'interactive', stage: 'check', prompt: 'Order the **request** steps.', explanation: 'Validate before saving.',
  interaction: { type: 'step-ordering', steps: ['Read', 'Validate', 'Save'].map((text) => ({ text, indent: 0 })) },
}
const stubs = { RouterLink: { template: '<a><slot /></a>' } }

afterEach(() => { pluginState.ready = true })

describe('InteractiveExercise with a built-in block', () => {
  it('reports the answer only once it is complete', async () => {
    const wrapper = mount(InteractiveExercise, { props: { exercise, modelValue: null, result: null }, global: { stubs } })
    await flushPromises()
    expect(wrapper.find('h1 strong').text()).toBe('request')

    const bank = () => wrapper.findAll('.bank .piece')
    const pick = async (text: string) => bank().find((b) => b.text() === text).trigger('click')
    await pick('Read')
    await pick('Validate')
    const events = wrapper.emitted('update:modelValue').map(([value]) => value)
    expect(events.every((value) => value === null)).toBe(true)
    // The block's own Check button is hidden; the lesson footer checks the answer.
    expect(wrapper.findAll('button').some((b) => b.text() === 'Check')).toBe(false)

    await pick('Save')
    expect(wrapper.emitted('update:modelValue').at(-1)).toEqual([[0, 1, 2]])
    wrapper.unmount()
  })

  it('restores the answer, locks it and explains once graded', async () => {
    const wrapper = mount(InteractiveExercise, {
      props: { exercise, modelValue: [0, 2, 1], result: { status: 'wrong', data: { score: 3, feedback: '1 of 3 steps are in the right position.' } } },
      global: { stubs },
    })
    await flushPromises()
    const placed = wrapper.findAll('.slots .piece')
    expect(placed.map((p) => p.text())).toEqual(['Read', 'Save', 'Validate'])
    expect(placed.every((p) => (p.element as HTMLButtonElement).disabled)).toBe(true)
    expect(placed.map((p) => p.classes())).toEqual([expect.arrayContaining(['ok']), expect.arrayContaining(['bad']), expect.arrayContaining(['bad'])])
    expect(wrapper.get('.explain').text()).toContain('1 of 3 steps are in the right position.')
    expect(wrapper.get('.explain').text()).toContain('Validate before saving.')
    wrapper.unmount()
  })

  it('shows the missing extension and lets the lesson move on', async () => {
    pluginState.ready = true
    const missing = { ...exercise, interaction: { type: 'math/fractions' } }
    const wrapper = mount(InteractiveExercise, { props: { exercise: missing, modelValue: null, result: null }, global: { stubs } })
    expect(wrapper.text()).toContain('This card uses the “math/fractions” extension, which is not installed.')
    expect(wrapper.emitted('unavailable')).toHaveLength(1)
  })
})
