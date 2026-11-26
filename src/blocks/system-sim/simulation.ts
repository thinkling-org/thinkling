import { t } from './messages.ts'
// Simulate architectures for system design exercises.
//
// The model defines the scenario: traffic, nodes, failures, controls and goals.
// The simulator computes consistent chart values from those inputs.
// Each traffic class is represented as a request rate evaluated once per second
// as it flows through successive nodes.

export const NODE_KINDS = ['limiter', 'cache', 'service', 'queue', 'store']
export const ALGORITHMS = ['token', 'fixed', 'sliding', 'leaky']
export const FAIL_MODES = ['open', 'closed', 'local']
export const METRICS = ['errorRate', 'latency', 'passedPerWindow', 'utilization', 'cost']

const NUMERIC_PARAMS = ['capacity', 'instances', 'latencyMs', 'hitRate', 'maxQueue', 'limit', 'window', 'burst', 'copies']
const PARAMS = [...NUMERIC_PARAMS, 'algorithm', 'failMode', 'store']
const MAX_COMBINATIONS = 512
const MAX_LATENCY_FACTOR = 10

const hasText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const list = (value) => (Array.isArray(value) ? value : [])
const finite = (value: unknown, fallback = 0) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback)
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const ID = /^[A-Za-z_][\w-]{0,31}$/

interface TrafficSource {
  id: string
  label: string
  rate: number
  burstSize: number
  burstEvery: number
  burstOffset: number
  burstLength: number
  limited: boolean
  phases: { from: number; to: number; rate: number }[]
}

interface SimNode {
  id: string
  label: string
  kind: string
  capacity: number
  instances: number
  latencyMs: number
  hitRate: number
  maxQueue: number
  algorithm: string
  limit: number
  window: number
  burst: number
  copies: number
  store: string
  failMode: string
}

interface Control {
  label: string
  options: { label: string; detail: string; cost: number; set: { node: string; param: string; value: string | number }[] }[]
}

interface Goal {
  label: string
  metric: string
  target: string
  op: '>=' | '<='
  value: number
  window: number
  hint: string
}

export interface SimulationScenario {
  type: 'system-sim'
  instruction: string
  duration: number
  costUnit: string
  sources: TrafficSource[]
  nodes: SimNode[]
  path: string[]
  failures: { node: string; from: number; to: number; label: string }[]
  controls: Control[]
  goals: Goal[]
  solutions?: number[][]
}

// ---------------------------------------------------------------- walidacja

function readSource(source): TrafficSource | null {
  if (!ID.test(source?.id ?? '') || !hasText(source.label)) return null
  return {
    id: source.id,
    label: source.label.trim(),
    rate: Math.max(0, finite(source.rate)),
    burstSize: Math.max(0, finite(source.burstSize)),
    burstEvery: Math.max(0, Math.round(finite(source.burstEvery))),
    burstOffset: Math.max(0, Math.round(finite(source.burstOffset))),
    burstLength: Math.max(1, Math.round(finite(source.burstLength, 1))),
    limited: !!source.limited,
    phases: list(source.phases)
      .filter((p) => Number.isFinite(p?.from) && Number.isFinite(p.to) && p.to > p.from && Number.isFinite(p.rate))
      .map((p) => ({ from: p.from, to: p.to, rate: Math.max(0, p.rate) })),
  }
}

function readNode(node): SimNode | null {
  if (!ID.test(node?.id ?? '') || !hasText(node.label) || !NODE_KINDS.includes(node.kind)) return null
  return {
    id: node.id,
    label: node.label.trim(),
    kind: node.kind,
    capacity: Math.max(0, finite(node.capacity)),
    instances: Math.max(1, Math.round(finite(node.instances, 1))),
    latencyMs: Math.max(0, finite(node.latencyMs)),
    hitRate: clamp(finite(node.hitRate), 0, 1),
    maxQueue: Math.max(0, finite(node.maxQueue)),
    algorithm: ALGORITHMS.includes(node.algorithm) ? node.algorithm : 'fixed',
    limit: Math.max(0, finite(node.limit)),
    window: Math.max(1, Math.round(finite(node.window, 60))),
    burst: Math.max(0, finite(node.burst)),
    copies: Math.max(1, Math.round(finite(node.copies, 1))),
    store: hasText(node.store) ? node.store.trim() : '',
    failMode: FAIL_MODES.includes(node.failMode) ? node.failMode : 'open',
  }
}

/** Parse a control option into a parameter value, or return undefined if invalid. */
function readParamValue(param, raw, storeIds) {
  const text = String(raw ?? '').trim()
  if (NUMERIC_PARAMS.includes(param)) {
    const value = Number(text.replace(',', '.'))
    return text && Number.isFinite(value) && value >= 0 ? value : undefined
  }
  if (param === 'algorithm') return ALGORITHMS.includes(text) ? text : undefined
  if (param === 'failMode') return FAIL_MODES.includes(text) ? text : undefined
  if (param === 'store') return text === '' || storeIds.has(text) ? text : undefined
  return undefined
}

/**
 * Sprawdza scenariusz od modelu. Zwraca { scenario } albo { error } z powodem odrzucenia.
 * A valid scenario has at least one configuration that satisfies every goal.
 * The starting configuration, which uses the first options, must miss at least one goal.
 */
export function checkScenario(raw: Record<string, unknown>) {
  if (!hasText(raw?.instruction)) return { error: t('missing instructions') }
  const duration = clamp(Math.round(finite(raw.duration, 600)), 30, 1800)

  const sources = list(raw.sources).map(readSource).filter(Boolean).slice(0, 5)
  if (!sources.length) return { error: t('missing traffic sources') }
  if (new Set(sources.map((s) => s.id)).size !== sources.length) return { error: t('duplicate source ID') }

  const nodes = list(raw.nodes).map(readNode).filter(Boolean).slice(0, 8)
  const byId = new Map(nodes.map((n) => [n.id, n]))
  if (byId.size !== nodes.length) return { error: t('duplicate node ID') }
  const storeIds = new Set(nodes.filter((n) => n.kind === 'store').map((n) => n.id))
  for (const node of nodes) {
    if (node.kind === 'limiter' && node.store && !storeIds.has(node.store)) return { error: t('unknown store {0}', [node.store]) }
  }

  const path = list(raw.path).filter((id) => byId.has(id) && byId.get(id).kind !== 'store')
  if (!path.length || new Set(path).size !== path.length) return { error: t('empty or repeated path') }

  const failures = list(raw.failures)
    .filter((f) => byId.has(f?.node) && Number.isFinite(f.from) && Number.isFinite(f.to) && f.to > f.from)
    .map((f) => ({ node: f.node, from: Math.max(0, Math.round(f.from)), to: Math.min(duration, Math.round(f.to)), label: hasText(f.label) ? f.label.trim() : t('{0} is unavailable', [byId.get(f.node).label]) }))
    .slice(0, 4)

  const controls: Control[] = []
  for (const control of list(raw.controls).slice(0, 5)) {
    if (!hasText(control?.label)) continue
    const options = []
    for (const option of list(control.options).slice(0, 5)) {
      if (!hasText(option?.label)) continue
      const set = []
      for (const change of list(option.set)) {
        const node = byId.get(change?.node)
        if (!node || !PARAMS.includes(change.param)) return { error: t('invalid change in option "{0}"', [option.label]) }
        const value = readParamValue(change.param, change.value, storeIds)
        if (value === undefined) return { error: t('invalid {0}="{1}" in option "{2}"', [change.param, change.value, option.label]) }
        set.push({ node: node.id, param: change.param, value })
      }
      options.push({ label: option.label.trim(), detail: hasText(option.detail) ? option.detail.trim() : '', cost: Math.max(0, finite(option.cost)), set })
    }
    if (options.length >= 2) controls.push({ label: control.label.trim(), options })
  }
  if (!controls.length) return { error: t('missing controls') }

  const targets = new Set([...sources.map((s) => s.id), ...nodes.map((n) => n.id)])
  const goals = list(raw.goals).filter((goal) => {
    if (!hasText(goal?.label) || !METRICS.includes(goal.metric) || !Number.isFinite(goal.value)) return false
    if (goal.metric === 'cost') return true
    if (goal.metric === 'utilization') return byId.has(goal.target)
    return sources.some((s) => s.id === goal.target) && targets.has(goal.target)
  }).map((goal): Goal => ({
    label: goal.label.trim(),
    metric: goal.metric,
    target: goal.metric === 'cost' ? '' : goal.target,
    op: goal.op === '>=' ? '>=' : '<=',
    value: goal.value,
    window: Math.max(1, Math.round(finite(goal.window, 60))),
    hint: hasText(goal.hint) ? goal.hint.trim() : '',
  })).slice(0, 5)
  if (!goals.length) return { error: t('missing goals') }

  const scenario: SimulationScenario = {
    type: 'system-sim',
    instruction: raw.instruction,
    duration,
    costUnit: hasText(raw.costUnit) ? raw.costUnit.trim() : '',
    sources, nodes, path, failures, controls, goals,
  }

  const combinations = controls.reduce((total, c) => total * c.options.length, 1)
  if (combinations > MAX_COMBINATIONS) return { error: t('too many control combinations') }
  const start = controls.map(() => 0)
  if (passes(scenario, start)) return { error: t('the initial configuration already meets all goals') }
  const solutions = allPicks(controls).filter((picks) => passes(scenario, picks))
  if (!solutions.length) return { error: t('no configuration meets all goals') }
  return { scenario: { ...scenario, solutions } }
}

function allPicks(controls: Control[]) {
  return controls.reduce<number[][]>((acc, control) => acc.flatMap((picks) => control.options.map((_, k) => [...picks, k])), [[]])
}

function passes(scenario: SimulationScenario, picks: number[]) {
  const result = simulate(scenario, picks)
  return evaluate(scenario, result, scenario.duration - 1).every((goal) => goal.ok)
}

// ---------------------------------------------------------------- symulacja

export function configure(scenario: SimulationScenario, picks: number[]) {
  const nodes = new Map(scenario.nodes.map((n) => [n.id, { ...n }]))
  let cost = 0
  scenario.controls.forEach((control, i) => {
    const option = control.options[picks[i]] ?? control.options[0]
    cost += option.cost
    for (const change of option.set) Object.assign(nodes.get(change.node), { [change.param]: change.value })
  })
  return { nodes, cost }
}

function rateAt(source: TrafficSource, t: number) {
  let rate = source.rate
  for (const phase of source.phases) if (t >= phase.from && t < phase.to) rate = phase.rate
  if (source.burstEvery > 0 && t >= source.burstOffset && (t - source.burstOffset) % source.burstEvery < source.burstLength) {
    rate += source.burstSize
  }
  return rate
}

const capacityOf = (node: SimNode) => (node.capacity > 0 ? node.capacity * node.instances : Infinity)
const queueFactor = (u: number) => Math.min(MAX_LATENCY_FACTOR, 1 / (1 - Math.min(u, 0.9)))

interface LimiterState {
  history: number[]
  tokens?: number
  queue?: number
  window?: number
  used?: number
}

interface NodeState {
  backlog: number[]
  perClass: LimiterState[]
  storeBacklog?: number
}

/** Apply one second of rate limiting to a traffic class. Return accepted requests and wait time in ms. */
function limit(node: SimNode, state: LimiterState, flow: number, effectiveLimit: number, t: number): [number, number] {
  const rate = effectiveLimit / node.window
  switch (node.algorithm) {
    case 'token': {
      const capacity = Math.max(node.burst * (effectiveLimit / Math.max(node.limit, 1e-9)), rate)
      state.tokens = Math.min(capacity, (state.tokens ?? capacity) + rate)
      const passed = Math.min(flow, state.tokens)
      state.tokens -= passed
      return [passed, 0]
    }
    case 'sliding': {
      const used = state.history.reduce((sum, v) => sum + v, 0)
      const passed = Math.min(flow, Math.max(0, effectiveLimit - used))
      state.history.push(passed)
      if (state.history.length > node.window - 1) state.history.shift()
      return [passed, 0]
    }
    case 'leaky': {
      const capacity = Math.max(node.burst * (effectiveLimit / Math.max(node.limit, 1e-9)), rate)
      state.queue = Math.min(capacity, (state.queue ?? 0) + flow)
      const passed = Math.min(state.queue, rate)
      state.queue -= passed
      return [passed, rate > 0 ? state.queue / rate * 1000 : 0]
    }
    default: {
      const window = Math.floor(t / node.window)
      if (state.window !== window) {
        state.window = window
        state.used = 0
      }
      const passed = Math.min(flow, Math.max(0, effectiveLimit - state.used))
      state.used += passed
      return [passed, 0]
    }
  }
}

/** Queue requests before a capacity-limited node. Update flows in place and return delay and drops. */
function serve(node: SimNode, state: NodeState, flows: number[]) {
  const capacity = capacityOf(node)
  const incoming = flows.reduce((sum, f) => sum + f, 0)
  const total = incoming + state.backlog.reduce((sum, b) => sum + b, 0)
  const processed = Math.min(total, capacity)
  const remaining = total - processed
  const kept = Math.min(remaining, node.maxQueue)
  const dropped = flows.map((f, k) => {
    const share = f + state.backlog[k]
    const left = total > 0 ? share * remaining / total : 0
    const drop = remaining > 0 ? left * (remaining - kept) / remaining : 0
    flows[k] = total > 0 ? share * processed / total : 0
    state.backlog[k] = left - drop
    return drop
  })
  const utilization = Number.isFinite(capacity) ? incoming / capacity : 0
  const latency = node.latencyMs * queueFactor(utilization) + (Number.isFinite(capacity) ? kept / capacity * 1000 : 0)
  return { latency, dropped, utilization }
}

/**
 * Simulate the selected configuration and return time series for each traffic class
 * (offered requests, served requests, errors and mean latency) and node (load and failures).
 */
export function simulate(scenario: SimulationScenario, picks: number[]) {
  const { nodes, cost } = configure(scenario, picks)
  const { duration, sources, path, failures } = scenario
  const classCount = sources.length
  const zeros = () => new Array<number>(classCount).fill(0)
  const isDown = (id: string, t: number) => failures.some((f) => f.node === id && t >= f.from && t < f.to)

  const state = new Map<string, NodeState>([...nodes.values()].map((n) => [n.id, {
    backlog: zeros(),
    perClass: sources.map(() => ({ history: [] })),
  }]))
  const storeLatency = new Map<string, number>()

  const perClass = sources.map((): { offered: number[]; completed: number[]; errors: number[]; latency: (number | null)[] } => ({ offered: [], completed: [], errors: [], latency: [] }))
  const perNode = new Map<string, { utilization: number[]; down: boolean[]; mode: string[] }>([...nodes.keys()].map((id) => [id, { utilization: [], down: [], mode: [] }]))

  for (let t = 0; t < duration; t++) {
    const flows = sources.map((s) => rateAt(s, t))
    const offered = [...flows]
    const latency = zeros()
    const errors = zeros()
    const doneAmount = zeros()
    const doneLatency = zeros()
    const storeLoad = new Map<string, number>()
    const utilization = new Map<string, number>()
    const modes = new Map<string, string>()

    for (const id of path) {
      const node = nodes.get(id)
      const nodeState = state.get(id)
      const down = isDown(id, t)

      if (node.kind === 'limiter') {
        const store = node.store ? nodes.get(node.store) : null
        const mode = down || (store && isDown(store.id, t)) ? node.failMode : 'normal'
        modes.set(id, mode)
        if (mode === 'closed') {
          flows.forEach((f, k) => { errors[k] += f; flows[k] = 0 })
          continue
        }
        if (store && mode === 'normal') {
          const checked = flows.reduce((sum, f) => sum + f, 0)
          storeLoad.set(store.id, (storeLoad.get(store.id) ?? 0) + checked)
          flows.forEach((_, k) => { latency[k] += storeLatency.get(store.id) ?? store.latencyMs })
        }
        if (mode !== 'open') {
          const effective = store || mode === 'local' ? node.limit : node.limit * node.copies
          sources.forEach((source, k) => {
            if (!source.limited) return
            const [passed, wait] = limit(node, nodeState.perClass[k], flows[k], effective, t)
            errors[k] += flows[k] - passed
            flows[k] = passed
            latency[k] += wait
          })
        }
        flows.forEach((_, k) => { latency[k] += node.latencyMs })
        continue
      }

      if (down) {
        modes.set(id, 'down')
        if (node.kind === 'cache') {
          flows.forEach((_, k) => { latency[k] += node.latencyMs })
          continue
        }
        flows.forEach((f, k) => { errors[k] += f + nodeState.backlog[k]; flows[k] = 0; nodeState.backlog[k] = 0 })
        continue
      }

      if (node.kind === 'cache') {
        flows.forEach((f, k) => {
          latency[k] += node.latencyMs
          const hits = f * node.hitRate
          doneAmount[k] += hits
          doneLatency[k] += hits * latency[k]
          flows[k] = f - hits
        })
        continue
      }

      const served = serve(node, nodeState, flows)
      utilization.set(id, served.utilization)
      served.dropped.forEach((d, k) => { errors[k] += d; latency[k] += served.latency })
    }

    flows.forEach((f, k) => {
      doneAmount[k] += f
      doneLatency[k] += f * latency[k]
    })

    for (const node of nodes.values()) {
      if (node.kind !== 'store') continue
      // The store is off the main request path. Each limit check consumes one operation,
      // and queued operations add delay to later checks.
      const nodeState = state.get(node.id)
      if (isDown(node.id, t)) {
        modes.set(node.id, 'down')
        nodeState.storeBacklog = 0
        storeLatency.set(node.id, node.latencyMs)
        continue
      }
      const load = storeLoad.get(node.id) ?? 0
      const capacity = capacityOf(node)
      const bounded = Number.isFinite(capacity)
      const u = bounded ? load / capacity : 0
      const backlog = bounded ? Math.max(0, (nodeState.storeBacklog ?? 0) + load - capacity) : 0
      nodeState.storeBacklog = backlog
      utilization.set(node.id, u)
      storeLatency.set(node.id, node.latencyMs * queueFactor(u) + (bounded ? backlog / capacity * 1000 : 0))
    }

    sources.forEach((_, k) => {
      const series = perClass[k]
      series.offered.push(offered[k])
      series.completed.push(doneAmount[k])
      series.errors.push(errors[k])
      series.latency.push(doneAmount[k] > 0 ? doneLatency[k] / doneAmount[k] : null)
    })
    for (const [id, series] of perNode) {
      series.utilization.push((utilization.get(id) ?? 0) * 100)
      series.down.push(isDown(id, t))
      series.mode.push(modes.get(id) ?? 'normal')
    }
  }

  return { cost, nodes, perClass, perNode, storeLatency }
}

// ---------------------------------------------------------------- cele

/** Return the time series for a goal. Cost has no time series. */
export function goalSeries(scenario: SimulationScenario, result: ReturnType<typeof simulate>, goal: Goal): (number | null)[] | null {
  if (goal.metric === 'cost') return null
  if (goal.metric === 'utilization') return result.perNode.get(goal.target).utilization
  const k = scenario.sources.findIndex((s) => s.id === goal.target)
  const series = result.perClass[k]
  if (goal.metric === 'latency') return series.latency
  if (goal.metric === 'errorRate') {
    return series.offered.map((o, t) => (o > 0 ? series.errors[t] / o * 100 : null))
  }
  // passedPerWindow: total requests served in the window ending at t
  const sums: number[] = []
  let running = 0
  series.completed.forEach((c, t) => {
    running += c
    if (t >= goal.window) running -= series.completed[t - goal.window]
    sums.push(running)
  })
  return sums
}

/** Compute the goal value from the start through second upto, inclusive. */
function goalValue(scenario: SimulationScenario, result: ReturnType<typeof simulate>, goal: Goal, upto: number) {
  if (goal.metric === 'cost') return result.cost
  if (goal.metric === 'errorRate') {
    const k = scenario.sources.findIndex((s) => s.id === goal.target)
    const { offered, errors } = result.perClass[k]
    let o = 0
    let e = 0
    for (let t = 0; t <= upto; t++) { o += offered[t]; e += errors[t] }
    return o > 0 ? e / o * 100 : 0
  }
  const series = goalSeries(scenario, result, goal)
  let extreme = goal.op === '>=' ? Infinity : -Infinity
  for (let t = 0; t <= upto; t++) {
    const v = series[t]
    if (v == null) continue
    extreme = goal.op === '>=' ? Math.min(extreme, v) : Math.max(extreme, v)
  }
  return Number.isFinite(extreme) ? extreme : 0
}

export function evaluate(scenario: SimulationScenario, result: ReturnType<typeof simulate>, upto: number) {
  return scenario.goals.map((goal) => {
    const value = goalValue(scenario, result, goal, upto)
    const ok = goal.op === '>=' ? value >= goal.value - 1e-9 : value <= goal.value + 1e-9
    return { ...goal, current: value, ok }
  })
}
