// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CodeTrace from '../../src/components/CodeTrace.vue'
import type { CodeTrace as Trace, Exercise } from '../../src/domain.ts'

vi.mock('../../src/lib/sfx.ts', () => ({ play: vi.fn(), playStep: vi.fn(), prepareSfx: vi.fn() }))
enableAutoUnmount(afterEach)
beforeEach(() => {
  vi.useFakeTimers()
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
})
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView') })
const exercise: Exercise = { id: 'predict', type: 'choice', stage: 'check', prompt: 'Predict', code: 'let x = 1;\nx++;\nconsole.log(x);', codeLanguage: 'javascript', options: ['1', '2'], correctIndex: 1 }
const trace: Trace = { mistake: 'The increment changes x.', takeaway: 'Track each assignment.', steps: [
  { line: 1, phase: 'Initialize', title: 'Start', say: 'Create the binding.', memory: [{ name: 'x', value: '', kind: 'uninitialized' }], output: [] },
  { line: 2, phase: 'Execute', title: 'Increment', say: 'Increase x.', note: 'x is now 2', memory: [{ name: 'x', value: '2', kind: 'number', changed: true }], output: [] },
  { line: 3, phase: 'Execute', title: 'Print', say: 'Write the output.', memory: [{ name: 'x', value: '2', kind: 'number' }], output: ['2'] },
] }

describe('guided code execution trace', () => {
  it('reveals memory, output, explanations and the takeaway as the learner advances', async () => {
    const wrapper = mount(CodeTrace, { props: { exercise, trace, chosenIndex: 0 } })
    expect(wrapper.get('.chip-r').text()).toBe('yours: 1')
    expect(wrapper.get('.chip-g').text()).toBe('correct: 2')
    expect(wrapper.get('.mv').text()).toBe('‹TDZ›')
    expect(wrapper.get('.ln.on .no').text()).toBe('1')
    await wrapper.get('[aria-label="Next step"]').trigger('click')
    expect(wrapper.get('.mrow.changed .mv').text()).toBe('2')
    expect(wrapper.get('.ghost').text()).toContain('x is now 2')
    await wrapper.get('[aria-label="Next step"]').trigger('click')
    expect(wrapper.get('.out-b .fresh').text()).toBe('2')
    expect(wrapper.get('.lessons').text()).toContain('Track each assignment.')
    expect(wrapper.get('[aria-label="Next step"]').attributes('disabled')).toBeDefined()
    await vi.advanceTimersByTimeAsync(300)
    await wrapper.get('[aria-label="From the start"]').trigger('click')
    expect(wrapper.find('.lessons').exists()).toBe(false)
    expect(wrapper.get('.cnt').text()).toBe('1 / 3')
  })

  it('supports arrow keys and step selection while leaving text input keys alone', async () => {
    const wrapper = mount(CodeTrace, { props: { exercise, trace } })
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }))
    await nextTick()
    expect(wrapper.get('.cnt').text()).toBe('2 / 3')
    const input = document.createElement('textarea')
    document.body.append(input)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await nextTick()
    expect(wrapper.get('.cnt').text()).toBe('2 / 3')
    input.remove()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    await nextTick()
    expect(wrapper.get('.cnt').text()).toBe('1 / 3')
    await wrapper.get('[aria-label="Step 3"]').trigger('click')
    expect(wrapper.get('.cnt').text()).toBe('3 / 3')
    wrapper.unmount()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
  })

  it('shows an explanation without answer badges for a learning card', () => {
    const wrapper = mount(CodeTrace, { props: { exercise: { ...exercise, type: 'learn' }, trace: { ...trace, steps: [trace.steps[0]] } } })
    expect(wrapper.find('.chip-r').exists()).toBe(false)
    expect(wrapper.find('.chip-g').exists()).toBe(false)
    expect(wrapper.get('.lessons').text()).toContain('What mattered')
  })
})
