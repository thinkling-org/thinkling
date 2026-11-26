import { describe, expect, it } from 'vitest'
import { checkScenario, configure, evaluate, goalSeries, simulate } from '../../src/blocks/system-sim/simulation.ts'
import type { SimulationScenario } from '../../src/blocks/system-sim/simulation.ts'

function rawScenario() {
  return {
    instruction: 'Scale the API to serve all requests.', duration: 30,
    sources: [{ id: 'users', label: 'Users', rate: 10 }],
    nodes: [{ id: 'api', label: 'API', kind: 'service', capacity: 5, latencyMs: 10 }],
    path: ['api'],
    controls: [{ label: 'Instances', options: [
      { label: 'One', cost: 1, set: [] },
      { label: 'Two', cost: 2, set: [{ node: 'api', param: 'instances', value: '2' }] },
    ] }],
    goals: [{ label: 'No errors', metric: 'errorRate', target: 'users', value: 0 }],
  }
}

function scenario() {
  const checked = checkScenario(rawScenario())
  expect(checked.error).toBeUndefined()
  return checked.scenario!
}

describe('system simulation scenario validation', () => {
  it('finds a working configuration and normalizes model data', () => {
    const result = scenario()
    expect(result.solutions).toEqual([[1]])
    expect(result.nodes[0]).toMatchObject({ instances: 1, maxQueue: 0, hitRate: 0 })
    expect(result.controls[0].options[1].set[0].value).toBe(2)
    expect(evaluate(result, simulate(result, [0]), 29)[0]).toMatchObject({ current: 50, ok: false })
    expect(evaluate(result, simulate(result, [1]), 29)[0]).toMatchObject({ current: 0, ok: true })
  })

  it.each([
    ['missing instructions', (raw) => { raw.instruction = ' ' }],
    ['missing traffic sources', (raw) => { raw.sources = [{ id: 'invalid id', label: 'Bad' }] }],
    ['duplicate source ID', (raw) => { raw.sources.push({ ...raw.sources[0] }) }],
    ['duplicate node ID', (raw) => { raw.nodes.push({ ...raw.nodes[0] }) }],
    ['empty or repeated path', (raw) => { raw.path = ['api', 'api'] }],
    ['empty or repeated path', (raw) => { raw.path = ['unknown'] }],
    ['unknown store missing', (raw) => { raw.nodes.push({ id: 'limit', label: 'Limit', kind: 'limiter', store: 'missing' }) }],
    ['missing controls', (raw) => { raw.controls = [{ label: 'Incomplete', options: [] }] }],
    ['missing goals', (raw) => { raw.goals[0].target = 'unknown' }],
    ['invalid change', (raw) => { raw.controls[0].options[1].set[0].param = 'unknown' }],
    ['invalid instances', (raw) => { raw.controls[0].options[1].set[0].value = '-1' }],
    ['invalid algorithm', (raw) => { raw.controls[0].options[1].set[0] = { node: 'api', param: 'algorithm', value: 'unknown' } }],
    ['invalid failMode', (raw) => { raw.controls[0].options[1].set[0] = { node: 'api', param: 'failMode', value: 'unknown' } }],
    ['invalid store', (raw) => { raw.controls[0].options[1].set[0] = { node: 'api', param: 'store', value: 'unknown' } }],
    ['initial configuration already meets', (raw) => { raw.nodes[0].capacity = 20 }],
    ['no configuration meets', (raw) => { raw.sources[0].rate = 100 }],
    ['too many control combinations', (raw) => { raw.controls = Array.from({ length: 5 }, () => ({ label: 'Scale', options: Array.from({ length: 5 }, () => ({ label: 'Option', set: [] })) })) }],
  ])('rejects %s', (message, change: (raw: any) => void) => {
    const raw = rawScenario()
    change(raw)
    expect(checkScenario(raw).error).toContain(message)
  })

  it('discards invalid phases and failures and bounds duration and node settings', () => {
    const raw: any = rawScenario()
    raw.duration = 1
    raw.nodes[0].hitRate = 5
    raw.nodes[0].instances = -4
    raw.sources[0].phases = [{ from: 5, to: 10, rate: 20 }, { from: 3, to: 2, rate: 5 }]
    raw.failures = [{ node: 'unknown', from: 0, to: 2 }, { node: 'api', from: -1, to: 2 }]
    // A failure is allowed when the objective explicitly tolerates its errors.
    raw.goals[0].value = 25
    const result = checkScenario(raw).scenario!
    expect(result.duration).toBe(30)
    expect(result.nodes[0]).toMatchObject({ hitRate: 1, instances: 1 })
    expect(result.sources[0].phases).toEqual([{ from: 5, to: 10, rate: 20 }])
    expect(result.failures).toEqual([{ node: 'api', from: 0, to: 2, label: 'API is unavailable' }])
  })
})

describe('traffic flow and objectives', () => {
  it('configures copies without mutating the original scenario and falls back to the first option', () => {
    const s = scenario()
    expect(configure(s, [99]).cost).toBe(1)
    expect(configure(s, [1]).nodes.get('api')!.instances).toBe(2)
    expect(s.nodes[0].instances).toBe(1)
  })

  it('applies phase boundaries and periodic bursts at their offset', () => {
    const s = scenario()
    s.duration = 6
    Object.assign(s.sources[0], { rate: 2, phases: [{ from: 2, to: 4, rate: 5 }], burstEvery: 3, burstOffset: 1, burstLength: 1, burstSize: 10 })
    expect(simulate(s, [1]).perClass[0].offered).toEqual([2, 12, 5, 5, 12, 2])
  })

  it('queues excess traffic and drains it when traffic stops', () => {
    const s = scenario()
    s.duration = 3
    Object.assign(s.sources[0], { rate: 0, phases: [{ from: 0, to: 1, rate: 12 }] })
    s.nodes[0].maxQueue = 5
    const r = simulate(s, [0])
    expect(r.perClass[0].completed).toEqual([5, 5, 0])
    expect(r.perClass[0].errors).toEqual([2, 0, 0])
    expect(r.perClass[0].latency[2]).toBeNull()
    expect(r.perNode.get('api')!.utilization).toEqual([240, 0, 0])
  })

  it('splits capacity proportionally between traffic classes', () => {
    const s = scenario()
    s.duration = 1
    s.sources.push({ ...s.sources[0], id: 'bots', rate: 30 })
    const r = simulate(s, [1])
    expect(r.perClass.map((c) => c.completed[0])).toEqual([2.5, 7.5])
    expect(r.perClass.map((c) => c.errors[0])).toEqual([7.5, 22.5])
  })

  it('serves cache hits without loading the backend and bypasses an unavailable cache', () => {
    const s = scenario()
    s.duration = 2
    s.nodes.unshift({ ...s.nodes[0], id: 'cache', kind: 'cache', hitRate: 0.5, latencyMs: 1 })
    s.path.unshift('cache')
    s.failures = [{ node: 'cache', from: 1, to: 2, label: 'Offline' }]
    const r = simulate(s, [0])
    expect(r.perClass[0].completed).toEqual([10, 5])
    expect(r.perClass[0].errors).toEqual([0, 5])
    expect(r.perNode.get('cache')!.mode).toEqual(['normal', 'down'])
  })

  it('drops queued and incoming requests during a service failure', () => {
    const s = scenario()
    s.duration = 2
    s.nodes[0].maxQueue = 5
    s.failures = [{ node: 'api', from: 1, to: 2, label: 'Offline' }]
    const r = simulate(s, [0])
    expect(r.perClass[0].completed).toEqual([5, 0])
    expect(r.perClass[0].errors).toEqual([0, 15])
    expect(r.perNode.get('api')!.down).toEqual([false, true])
  })

  it('treats zero capacity as unbounded', () => {
    const s = scenario()
    s.nodes[0].capacity = 0
    const r = simulate(s, [])
    expect(r.perClass[0].errors.every((v) => v === 0)).toBe(true)
    expect(r.perClass[0].latency[0]).toBe(10)
  })

  it('evaluates cost, peak latency, utilization and rolling throughput', () => {
    const s = scenario()
    s.duration = 3
    s.goals = [
      { label: 'Budget', metric: 'cost', target: '', value: 2, op: '<=', window: 1, hint: '' },
      { label: 'Latency', metric: 'latency', target: 'users', value: 100, op: '<=', window: 1, hint: '' },
      { label: 'Load', metric: 'utilization', target: 'api', value: 100, op: '<=', window: 1, hint: '' },
      { label: 'Throughput', metric: 'passedPerWindow', target: 'users', value: 10, op: '>=', window: 2, hint: '' },
    ]
    const r = simulate(s, [1])
    expect(goalSeries(s, r, s.goals[0])).toBeNull()
    expect(goalSeries(s, r, s.goals[3])).toEqual([10, 20, 20])
    const evaluated = evaluate(s, r, 2)
    expect(evaluated.every((g) => g.ok)).toBe(true)
    expect(evaluated.map((g) => g.current)).toEqual([2, 100, 100, 10])
    s.sources[0].rate = 0
    const idle = simulate(s, [])
    expect(goalSeries(s, idle, { ...s.goals[1], metric: 'errorRate' })).toEqual([null, null, null])
    expect(evaluate(s, idle, 2)[1].current).toBe(0)
  })
})

function limited(algorithm: string): SimulationScenario {
  const s = scenario()
  s.duration = 4
  s.sources[0].limited = true
  s.nodes[0].capacity = 0
  s.nodes.unshift({ ...s.nodes[0], id: 'limit', kind: 'limiter', algorithm, limit: 4, window: 2, burst: 4, copies: 1, latencyMs: 0 })
  s.path.unshift('limit')
  return s
}

describe('rate limiters and shared stores', () => {
  it.each([
    ['fixed', [4, 0, 4, 0]],
    ['sliding', [4, 0, 4, 0]],
    ['token', [4, 2, 2, 2]],
    ['leaky', [2, 2, 2, 2]],
  ])('enforces the %s algorithm', (algorithm, expected) => {
    expect(simulate(limited(algorithm), []).perClass[0].completed).toEqual(expected)
  })

  it('leaves unrestricted traffic untouched and scales local limits by copy count', () => {
    const s = limited('fixed')
    s.nodes[0].copies = 2
    s.sources.push({ ...s.sources[0], id: 'trusted', limited: false })
    const r = simulate(s, [])
    expect(r.perClass[0].completed).toEqual([8, 0, 8, 0])
    expect(r.perClass[1].completed).toEqual([10, 10, 10, 10])
  })

  it.each([
    ['open', [10, 10, 4, 0]],
    ['closed', [0, 0, 4, 0]],
    ['local', [4, 0, 4, 0]],
  ])('uses fail-%s while the shared store is down', (mode, expected) => {
    const s = limited('fixed')
    s.nodes[0].store = 'redis'
    s.nodes[0].failMode = mode
    s.nodes.push({ ...s.nodes[1], id: 'redis', kind: 'store', capacity: 5, latencyMs: 1 })
    s.failures = [{ node: 'redis', from: 0, to: 2, label: 'Unavailable' }]
    const r = simulate(s, [])
    expect(r.perClass[0].completed).toEqual(expected)
    expect(r.perNode.get('limit')!.mode).toEqual([mode, mode, 'normal', 'normal'])
    expect(r.perNode.get('redis')!.utilization).toEqual([0, 0, 200, 200])
    expect(r.storeLatency.get('redis')).toBeGreaterThan(1000)
  })
})
