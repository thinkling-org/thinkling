// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SystemSim from '../../src/blocks/system-sim/SystemSim.vue'
import { checkScenario } from '../../src/blocks/system-sim/simulation.ts'

enableAutoUnmount(afterEach)
beforeEach(() => vi.useFakeTimers())
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })

function config() {
  return checkScenario({
    instruction: 'Scale the API.', duration: 30, costUnit: 'credits',
    sources: [{ id: 'users', label: 'Users', rate: 10, limited: true }],
    nodes: [
      { id: 'limit', label: 'Limiter', kind: 'limiter', limit: 100, window: 1, copies: 2, store: 'redis', failMode: 'open' },
      { id: 'redis', label: 'Redis', kind: 'store', capacity: 100 },
      { id: 'unused', label: 'Backup', kind: 'store' },
      { id: 'cache', label: 'Cache', kind: 'cache', hitRate: 0 },
      { id: 'api', label: 'API', kind: 'service', capacity: 5, latencyMs: 1 },
    ], path: ['limit', 'cache', 'api'],
    failures: [{ node: 'redis', from: 5, to: 10, label: 'Redis outage' }, { node: 'cache', from: 5, to: 10, label: 'Cache outage' }],
    controls: [{ label: 'Instances', options: [
      { label: 'One instance', cost: 1, set: [] },
      { label: 'Two instances', cost: 2, detail: 'Double capacity', set: [{ node: 'api', param: 'instances', value: '2' }] },
      { label: 'Three instances', cost: 3, set: [{ node: 'api', param: 'instances', value: '3' }] },
    ] }],
    goals: [
      { label: 'No errors', metric: 'errorRate', target: 'users', value: 0, hint: 'Add API capacity.' },
      { label: 'Latency', metric: 'latency', target: 'users', value: 100 },
      { label: 'Load', metric: 'utilization', target: 'api', value: 100 },
      { label: 'Throughput', metric: 'passedPerWindow', target: 'users', op: '>=', value: 5, window: 1 },
      { label: 'Budget', metric: 'cost', value: 3 },
    ],
  }).scenario!
}

describe('system simulation controls', () => {
  it('runs, pauses and resumes the clock, showing failures at the correct time', async () => {
    const wrapper = mount(SystemSim, { props: { config: config() } })
    expect(wrapper.get('.clock').text()).toBe('00:00')
    expect(wrapper.text()).toContain('unused')
    await wrapper.get('.player button').trigger('click')
    await vi.advanceTimersByTimeAsync(250)
    expect(wrapper.get('.clock').text()).toBe('00:05')
    expect(wrapper.text()).toContain('Redis outage')
    expect(wrapper.text()).toContain('allow all')
    expect(wrapper.text()).toContain('not running')
    await wrapper.get('.player button').trigger('click')
    await vi.advanceTimersByTimeAsync(100)
    expect(wrapper.get('.clock').text()).toBe('00:05')
    await wrapper.get('[aria-label="From the start"]').trigger('click')
    expect(wrapper.get('.clock').text()).toBe('00:00')
  })

  it('explains failed goals and clears the hint when configuration changes', async () => {
    const wrapper = mount(SystemSim, { props: { config: config() } })
    await wrapper.get('.hint-row button').trigger('click')
    expect(wrapper.get('.result.hint').text()).toContain('Run the simulation')
    await wrapper.get('[aria-label="Simulation time"]').setValue('29')
    await wrapper.findAll('[role="radio"]')[0].trigger('click')
    // Re-selecting also clears an earlier hint.
    await wrapper.get('.hint-row button').trigger('click')
    expect(wrapper.get('.result.hint').text()).toBe('Add API capacity.')
    await wrapper.findAll('[role="radio"]')[1].trigger('click')
    expect(wrapper.find('.result.hint').exists()).toBe(false)
    expect(wrapper.get('.result.ok').text()).toContain('All goals met throughout the run.')
    expect(wrapper.get('.result.ok').text()).toContain('one other configuration')
    expect(wrapper.findAll('.goals li.ok')).toHaveLength(5)
  })

  it('replays a completed simulation and stops its timer when unmounted', async () => {
    const wrapper = mount(SystemSim, { props: { config: config() } })
    await wrapper.findAll('[role="radio"]')[1].trigger('click')
    await wrapper.get('.player button').trigger('click')
    await vi.advanceTimersByTimeAsync(1500)
    expect(wrapper.get('.clock').text()).toBe('00:29')
    expect(wrapper.get('.player button').text()).toBe('Replay')
    expect(vi.getTimerCount()).toBe(0)
    await wrapper.get('.player button').trigger('click')
    expect(wrapper.get('.clock').text()).toBe('00:00')
    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('shows an encouraging hint before a passing run ends and resets on new configuration', async () => {
    const wrapper = mount(SystemSim, { props: { config: config() } })
    await wrapper.findAll('[role="radio"]')[1].trigger('click')
    await wrapper.get('[aria-label="Simulation time"]').setValue('2')
    await wrapper.get('.hint-row button').trigger('click')
    expect(wrapper.get('.result.hint').text()).toContain('Looking good so far')
    const next = config()
    next.nodes[0].store = ''
    await wrapper.setProps({ config: next })
    expect(wrapper.get('.clock').text()).toBe('00:00')
    expect(wrapper.find('.result.hint').exists()).toBe(false)
    expect(wrapper.text()).toContain('local counters')
  })
})
