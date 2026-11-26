// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import LogicCircuit from '../../src/blocks/logic-circuit/LogicCircuit.vue'
import ValueChart from '../../src/blocks/value-chart/ValueChart.vue'
import StateInspector from '../../src/blocks/state-inspector/StateInspector.vue'
import StepTrace from '../../src/blocks/step-trace/StepTrace.vue'
import Diagnosis from '../../src/blocks/diagnosis/Diagnosis.vue'
import CodeDefinitions from '../../src/blocks/code-definitions/CodeDefinitions.vue'

enableAutoUnmount(afterEach)

describe('interactive learning blocks', () => {
  it('updates circuit outputs and the active truth-table row when inputs change', async () => {
    const config = {
      instruction: 'Toggle both inputs.', inputs: [{ id: 'a', label: 'A', on: true }, { id: 'b', label: 'B', on: false }],
      outputs: [{ label: 'AND', expression: 'a && b', evaluate: ({ a, b }) => Number(!!(a && b)) }],
      notes: [{ pattern: '11', say: 'Both inputs are on.' }],
    }
    const wrapper = mount(LogicCircuit, { props: { config } })
    expect(wrapper.get('.lamp').text()).toBe('0')
    expect(wrapper.findAll('tbody tr')).toHaveLength(4)
    expect(wrapper.get('tbody tr.current').text()).toBe('100')
    await wrapper.findAll('.switch')[1].trigger('click')
    expect(wrapper.get('.lamp').attributes('aria-label')).toBe('AND: 1')
    expect(wrapper.get('.note').text()).toBe('Both inputs are on.')
    await wrapper.setProps({ config: { ...config, inputs: config.inputs.map((input) => ({ ...input, on: false })) } })
    expect(wrapper.get('.lamp').text()).toBe('0')
    expect(wrapper.find('.note').exists()).toBe(false)
  })

  it('omits an excessively large truth table', () => {
    const wrapper = mount(LogicCircuit, { props: { config: { instruction: '', inputs: ['a', 'b', 'c', 'd'].map((id) => ({ id, label: id })), outputs: [], notes: [] } } })
    expect(wrapper.find('table').exists()).toBe(false)
  })

  it('shows chart values, overflow markers and the note for the selected position', async () => {
    const config = { instruction: 'Compare growth.', xLabel: 'n', yLabel: 'Operations', xs: [1, 2, 3, 4], yMax: 10, series: [{ label: 'Linear', values: [1, 2, 3, 4] }, { label: 'Exponential', values: [2, 4, 8, 16] }], notes: [{ from: 1, say: 'Initially small.' }, { from: 4, say: 'Now outside the chart.' }] }
    const wrapper = mount(ValueChart, { props: { config } })
    expect(wrapper.get('input').attributes('aria-valuetext')).toBe('n 2')
    expect(wrapper.findAll('.value').map((node) => node.text())).toEqual(['2', '4'])
    const before = wrapper.findAll('path.line')[0].attributes('d')
    await wrapper.get('input').setValue('3')
    expect(wrapper.findAll('.value').map((node) => node.text())).toEqual(['4', '16 ↑'])
    expect(wrapper.get('li.off').text()).toContain('Exponential')
    expect(wrapper.findAll('circle.dot')).toHaveLength(1)
    expect(wrapper.get('.note').text()).toBe('Now outside the chart.')
    await wrapper.setProps({ config: { ...config, series: [{ label: 'Negative', values: [-4, -3, -2, -1] }], yMax: null, notes: [] } })
    expect(wrapper.get('input').attributes('aria-valuetext')).toBe('n 2')
    expect(wrapper.get('path.line').attributes('d')).not.toBe(before)
    expect(wrapper.find('.note').exists()).toBe(false)
  })

  it('selects stack frames in reverse display order and clears selection on the next step', async () => {
    const config = {
      instruction: 'Inspect the call stack.', label: 'Call stack', layout: 'stack', code: 'outer();\ninner();',
      steps: [
        { line: 1, say: 'Inner is active.', items: [{ label: 'Outer', details: [{ name: 'x', value: '1' }] }, { label: 'Inner', details: [{ name: 'x', value: '2' }] }] },
        { line: 2, say: 'Stack is empty.', items: [] },
      ],
    }
    const wrapper = mount(StateInspector, { props: { config } })
    expect(wrapper.findAll('.item-label').map((item) => item.text())).toEqual(['Inner', 'Outer'])
    expect(wrapper.get('.details dd').text()).toBe('2')
    await wrapper.findAll('.item')[1].trigger('click')
    expect(wrapper.get('.details dd').text()).toBe('1')
    await wrapper.get('.step-controls .btn-primary').trigger('click')
    expect(wrapper.get('.empty').text()).toBe('Empty')
    expect(wrapper.find('.details').exists()).toBe(false)
    await wrapper.setProps({ config: { ...config, layout: 'queue' } })
    expect(wrapper.findAll('.item-label').map((item) => item.text())).toEqual(['Outer', 'Inner'])
    expect(wrapper.get('.details dd').text()).toBe('1')
  })

  it('tracks changed variables and their history while navigating forward and backward', async () => {
    const config = { instruction: 'Follow x.', code: 'let x = 1;\nx++;\nconsole.log(x);', steps: [
      { line: 1, variables: [{ name: 'x', value: '1' }], say: 'Initialize.', output: '' },
      { line: 2, variables: [{ name: 'x', value: '2' }, { name: 'y', value: '3' }], say: 'Increment.', output: '' },
      { line: 3, variables: [{ name: 'x', value: '2' }], say: 'Print.', output: '2' },
    ] }
    const wrapper = mount(StepTrace, { props: { config } })
    expect(wrapper.find('.history').exists()).toBe(false)
    await wrapper.get('.step-controls .btn-primary').trigger('click')
    expect(wrapper.get('[aria-label="x history"]').text()).toBe('1 → 2')
    expect(wrapper.findAll('.var.changed')).toHaveLength(2)
    await wrapper.get('.step-controls .btn-primary').trigger('click')
    expect(wrapper.get('.out').text()).toBe('2')
    expect(wrapper.findAll('.var.changed')).toHaveLength(0)
    await wrapper.get('[aria-label="Previous step"]').trigger('click')
    expect(wrapper.get('.counter').text()).toBe('Step 2 / 3')
    await wrapper.findAll('.step-controls button')[2].trigger('click')
    expect(wrapper.get('.counter').text()).toBe('Step 1 / 3')
    await wrapper.setProps({ config: { ...config, instruction: 'New example' } })
    expect(wrapper.get('.value').text()).toBe('1')
  })

  it('reveals measurements before diagnosis and locks alternatives after a correct answer', async () => {
    const config = { instruction: 'Find the fault.', symptom: 'No response', checks: [
      { name: 'Network', action: 'Measure network', result: 'Online', ok: true, detail: 'ping host' },
      { name: 'Service', action: 'Measure service', result: 'Stopped', ok: false },
    ], options: [{ text: 'Network failure', correct: false, why: 'Network is online.' }, { text: 'Service failure', correct: true, why: 'Restart the service.' }] }
    const wrapper = mount(Diagnosis, { props: { config } })
    expect(wrapper.find('.result').exists()).toBe(false)
    await wrapper.findAll('.measure')[0].trigger('click')
    await wrapper.get('.measure').trigger('click')
    expect(wrapper.get('.count strong').text()).toBe('2')
    expect(wrapper.get('.checks li.bad').text()).toContain('Stopped')
    await wrapper.findAll('[role="radio"]')[0].trigger('click')
    expect(wrapper.get('.feedback').text()).toBe('Network is online.')
    await wrapper.findAll('[role="radio"]')[1].trigger('click')
    expect(wrapper.get('.feedback.ok').text()).toBe('Restart the service.')
    expect(wrapper.findAll('[role="radio"]')[0].attributes('disabled')).toBeDefined()
    await wrapper.setProps({ config: { ...config, symptom: 'New fault' } })
    expect(wrapper.get('.count strong').text()).toBe('0')
    expect(wrapper.find('.feedback').exists()).toBe(false)
  })

  it('selects a definition through chips or highlighted code and resets for a new example', async () => {
    const config = { instruction: 'Explore keywords.', code: 'let x = 1;\nconst y = 2;', terms: [
      { token: 'let', title: 'Mutable binding', definition: 'Can be reassigned.', kind: 'keyword', example: 'let count = 0' },
      { token: 'const', title: 'Constant binding', definition: 'Cannot be reassigned.' },
    ] }
    const wrapper = mount(CodeDefinitions, { props: { config } })
    expect(wrapper.get('.term-title').text()).toBe('Mutable binding')
    await wrapper.findAll('.chips button')[1].trigger('click')
    expect(wrapper.get('.term-title').text()).toBe('Constant binding')
    await wrapper.get('button[data-token="0"]').trigger('click')
    expect(wrapper.get('.term-title').text()).toBe('Mutable binding')
    await wrapper.setProps({ config: { ...config, code: 'let z = 3' } })
    expect(wrapper.get('.chips button[aria-pressed="true"]').text()).toBe('let')
  })
})
