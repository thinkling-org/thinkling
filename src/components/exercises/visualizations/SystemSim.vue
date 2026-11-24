<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import Markdown from '../../Markdown.vue'
import Icon from '../../Icon.vue'
import { configure, evaluate, goalSeries, simulate } from '../../../lib/system-sim.js'

const props = defineProps({ config: { type: Object, required: true } })

const W = 320
const H = 140
const PAD = { left: 8, right: 8, top: 10, bottom: 10 }
const PLAY_FRAMES = 300
const ALGORITHM_LABEL = { fixed: 'stałe okno', sliding: 'przesuwane okno', token: 'token bucket', leaky: 'leaky bucket' }
const MODE_LABEL = { open: 'przepuszcza wszystko', closed: 'odrzuca wszystko', local: 'limit lokalny' }
const number = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 1 })
const compact = new Intl.NumberFormat('pl-PL', { notation: 'compact', maximumSignificantDigits: 3 })

const picks = ref([])
const t = ref(0)
const playing = ref(false)
const hint = ref('')
let timer = null

function reset() {
  stop()
  picks.value = props.config.controls.map(() => 0)
  t.value = 0
  hint.value = ''
}
watch(() => props.config, reset, { immediate: true })
watch(picks, () => { hint.value = '' }, { deep: true })
onBeforeUnmount(stop)

const last = computed(() => props.config.duration - 1)
const finished = computed(() => t.value >= last.value)
const started = computed(() => t.value > 0)

function stop() {
  playing.value = false
  clearInterval(timer)
  timer = null
}
function toggle() {
  if (playing.value) return stop()
  if (finished.value) t.value = 0
  playing.value = true
  const step = Math.max(1, Math.round(props.config.duration / PLAY_FRAMES))
  timer = setInterval(() => {
    t.value = Math.min(last.value, t.value + step)
    if (finished.value) stop()
  }, 50)
}
function pick(control, option) {
  picks.value = picks.value.map((p, i) => (i === control ? option : p))
}

const result = computed(() => simulate(props.config, picks.value))
const nodes = computed(() => configure(props.config, picks.value).nodes)
const goals = computed(() => evaluate(props.config, result.value, t.value).map((goal) => ({
  ...goal,
  status: goal.metric === 'cost' || started.value ? (goal.ok ? 'ok' : 'bad') : 'todo',
})))
const solved = computed(() => finished.value && goals.value.every((goal) => goal.ok))
const otherSolutions = computed(() => props.config.solutions.length - 1)

const clock = computed(() => {
  const m = Math.floor(t.value / 60)
  const s = t.value % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})
const activeFailures = computed(() => props.config.failures.filter((f) => t.value >= f.from && t.value < f.to))

const unit = (goal) => ({
  errorRate: '%',
  latency: ' ms',
  passedPerWindow: ` / ${goal.window} s`,
  utilization: '%',
  cost: props.config.costUnit ? ` ${props.config.costUnit}` : '',
}[goal.metric])
const format = (value, goal) => `${value >= 10000 ? compact.format(value) : number.format(value)}${unit(goal)}`

// ---------------------------------------------------------------- wykresy

const px = (time) => PAD.left + time / Math.max(1, last.value) * (W - PAD.left - PAD.right)
const failureBands = computed(() => props.config.failures.map((f) => ({
  x: px(f.from), width: Math.max(2, px(f.to) - px(f.from)),
})))

const charts = computed(() => goals.value.filter((goal) => goal.metric !== 'cost').map((goal) => {
  const series = goalSeries(props.config, result.value, goal)
  const peak = Math.max(0, ...series.filter((v) => v != null))
  // Oś sięga najwyżej 4× progu, żeby próg był czytelny także przy ogromnych wartościach.
  const yMax = goal.value > 0 ? Math.max(goal.value * 1.6, Math.min(peak * 1.05, goal.value * 4)) : Math.max(peak * 1.05, 1)
  const py = (v) => H - PAD.bottom - Math.min(v, yMax) / yMax * (H - PAD.top - PAD.bottom)
  const points = []
  for (let time = 0; time <= t.value; time++) {
    if (series[time] != null) points.push(`${px(time).toFixed(1)},${py(series[time]).toFixed(1)}`)
  }
  let now = null
  for (let time = t.value; time >= 0 && now == null; time--) now = series[time]
  const bad = now != null && (goal.op === '>=' ? now < goal.value : now > goal.value)
  return {
    goal,
    points: points.join(' '),
    threshold: py(goal.value),
    clipped: peak > yMax,
    now: now == null ? '–' : format(now, goal),
    bad,
  }
}))

// ---------------------------------------------------------------- schemat

function nodeView(id) {
  const node = nodes.value.get(id)
  const series = result.value.perNode.get(id)
  const mode = series.mode[t.value]
  const utilization = series.utilization[t.value]
  const view = { id, label: node.label, kind: node.kind, lines: [], state: 'idle' }
  if (node.kind === 'limiter') {
    view.lines.push(`${ALGORITHM_LABEL[node.algorithm]} · ${number.format(node.limit)} / ${node.window} s`)
    if (node.store) view.lines.push(`licznik: ${nodes.value.get(node.store).label}`)
    else if (node.copies > 1) view.lines.push(`liczniki lokalne ×${node.copies}`)
    if (mode !== 'normal') {
      view.state = 'alert'
      view.lines.push(`awaria: ${MODE_LABEL[mode]}`)
    } else view.state = 'active'
    return view
  }
  if (mode === 'down') {
    view.state = 'down'
    view.lines.push('nie działa')
    return view
  }
  if (node.kind === 'cache') {
    view.state = 'active'
    view.lines.push(`trafienia ${Math.round(node.hitRate * 100)}%`)
    return view
  }
  if (node.kind === 'store' && !usedStores.value.has(id)) {
    view.lines.push(`×${node.instances} · nieużywany`)
    return view
  }
  view.state = utilization > 100 ? 'alert' : 'active'
  view.lines.push(`×${node.instances} · obciążenie ${Math.round(utilization)}%`)
  return view
}

const usedStores = computed(() => new Set([...nodes.value.values()]
  .filter((n) => n.kind === 'limiter' && n.store)
  .map((n) => n.store)))
// Magazyn rysujemy pod limiterem, który go używa. Nieużywany wisi pod pierwszym limiterem.
const firstLimiter = computed(() => props.config.path.find((id) => nodes.value.get(id).kind === 'limiter'))
const stages = computed(() => props.config.path.map((id) => {
  const node = nodes.value.get(id)
  const stores = node.kind !== 'limiter' ? [] : props.config.nodes.filter((n) => n.kind === 'store'
    && (node.store === n.id || (id === firstLimiter.value && !usedStores.value.has(n.id))))
  return { main: nodeView(id), stores: stores.map((n) => nodeView(n.id)), linked: !!node.store }
}))
const sources = computed(() => props.config.sources.map((source, k) => ({
  label: source.label,
  rate: result.value.perClass[k].offered[t.value],
})))

// ---------------------------------------------------------------- podpowiedź

function showHint() {
  const failing = evaluate(props.config, result.value, last.value).find((goal) => !goal.ok)
  if (!started.value) hint.value = 'Uruchom symulację i obserwuj wykresy. Czerwone pasy to czas awarii.'
  else if (failing) hint.value = failing.hint || `Ten cel nie przechodzi: ${failing.label}.`
  else if (!finished.value) hint.value = 'Na razie wygląda dobrze. Puść symulację do końca.'
  else hint.value = ''
}
</script>

<template>
  <section class="card viz sim" aria-label="Symulacja systemu">
    <Markdown class="instruction" :src="config.instruction" />

    <div class="player">
      <button type="button" class="btn btn-sm" :class="playing ? 'btn-ghost' : 'btn-primary'" @click="toggle">
        <Icon :name="playing ? 'pause' : 'play'" :size="16" />{{ playing ? 'Pauza' : finished ? 'Jeszcze raz' : 'Uruchom' }}
      </button>
      <button type="button" class="btn btn-ghost btn-sm icon-only" aria-label="Od początku" @click="stop(); t = 0">
        <Icon name="refresh" :size="16" />
      </button>
      <input
        v-model.number="t"
        type="range"
        min="0"
        :max="last"
        step="1"
        aria-label="Czas symulacji"
        :aria-valuetext="clock"
        @input="stop"
      />
      <span class="clock">{{ clock }}</span>
      <span v-for="f in activeFailures" :key="f.label" class="failure" aria-live="polite">{{ f.label }}</span>
    </div>

    <div class="layout">
      <div class="main">
        <div class="arch" aria-label="Architektura">
          <div class="node sources">
            <strong>Ruch</strong>
            <span v-for="s in sources" :key="s.label" class="line">{{ s.label }}: {{ compact.format(s.rate) }}/s</span>
          </div>
          <template v-for="stage in stages" :key="stage.main.id">
            <span class="wire" aria-hidden="true" />
            <div class="stage">
              <div class="node" :class="stage.main.state">
                <strong>{{ stage.main.label }}</strong>
                <span v-for="line in stage.main.lines" :key="line" class="line">{{ line }}</span>
              </div>
              <template v-for="store in stage.stores" :key="store.id">
                <span class="wire vertical" :class="{ off: !stage.linked }" aria-hidden="true" />
                <div class="node" :class="[store.state, { dashed: !stage.linked }]">
                  <strong>{{ store.label }}</strong>
                  <span v-for="line in store.lines" :key="line" class="line">{{ line }}</span>
                </div>
              </template>
            </div>
          </template>
        </div>

        <div class="charts">
          <figure v-for="chart in charts" :key="chart.goal.label" class="chart">
            <figcaption>
              <span>{{ chart.goal.label }}</span>
              <span class="now" :class="{ bad: chart.bad }">{{ chart.now }}</span>
            </figcaption>
            <svg :viewBox="`0 0 ${W} ${H}`" role="img" :aria-label="`Wykres: ${chart.goal.label}. Teraz ${chart.now}.`">
              <rect v-for="(band, i) in failureBands" :key="i" class="band" :x="band.x" :y="PAD.top" :width="band.width" :height="H - PAD.top - PAD.bottom" />
              <line class="base" :x1="PAD.left" :x2="W - PAD.right" :y1="H - PAD.bottom" :y2="H - PAD.bottom" />
              <line class="limit" :x1="PAD.left" :x2="W - PAD.right" :y1="chart.threshold" :y2="chart.threshold" />
              <text class="limit-label" :x="W - PAD.right" :y="chart.threshold - 5" text-anchor="end">{{ format(chart.goal.value, chart.goal) }}</text>
              <polyline class="series" :points="chart.points" />
              <line class="cursor" :x1="px(t)" :x2="px(t)" :y1="PAD.top" :y2="H - PAD.bottom" />
            </svg>
            <span v-if="chart.clipped" class="clip-note">Wartości powyżej skali są przycięte.</span>
          </figure>
        </div>

        <ul class="goals" aria-label="Cele">
          <li v-for="goal in goals" :key="goal.label" :class="goal.status">
            <span class="mark" aria-hidden="true">
              <Icon v-if="goal.status !== 'todo'" :name="goal.status === 'ok' ? 'check' : 'x'" :size="14" :stroke="3" />
            </span>
            <span class="goal-text">{{ goal.label }}</span>
            <span v-if="goal.status !== 'todo'" class="goal-value">{{ format(goal.current, goal) }}</span>
            <span class="sr-only">{{ goal.status === 'ok' ? 'spełniony' : goal.status === 'bad' ? 'niespełniony' : 'jeszcze nie sprawdzony' }}</span>
          </li>
        </ul>
      </div>

      <aside class="controls">
        <div v-for="(control, i) in config.controls" :key="control.label" class="group" role="radiogroup" :aria-label="control.label">
          <span class="label">{{ control.label }}</span>
          <button
            v-for="(option, k) in control.options"
            :key="option.label"
            type="button"
            role="radio"
            class="option"
            :class="{ on: picks[i] === k }"
            :aria-checked="picks[i] === k"
            @click="pick(i, k)"
          >
            <strong>{{ option.label }}</strong>
            <span v-if="option.detail || option.cost">{{ option.detail }}<template v-if="option.cost"> · koszt {{ number.format(option.cost) }}</template></span>
          </button>
        </div>
      </aside>
    </div>

    <p v-if="solved" class="result ok" aria-live="polite">
      Wszystkie cele spełnione przez cały przebieg.
      <template v-if="otherSolutions > 0">
        Istnieje jeszcze {{ otherSolutions === 1 ? 'jedno inne ustawienie' : `${otherSolutions} inne ustawienia` }}, które też przechodzi. Znajdź je i zastanów się, czym się różnią.
      </template>
    </p>
    <div v-else class="hint-row">
      <p v-if="hint" class="result hint" aria-live="polite">{{ hint }}</p>
      <button v-else type="button" class="btn btn-ghost btn-sm" @click="showHint">
        <Icon name="bulb" :size="16" />Podpowiedź
      </button>
    </div>
  </section>
</template>

<style scoped>
.sim {
  container-type: inline-size;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 14px;
  padding: clamp(12px, 3vw, 20px);
}
.instruction {
  color: var(--text-2);
}
.player {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: 2px solid var(--border);
  border-radius: 14px;
  background: var(--surface-2);
}
.player .btn-primary {
  min-width: 128px;
}
.icon-only {
  padding-inline: 10px;
}
.player input {
  flex: 1 1 160px;
  min-width: 0;
  height: 28px;
  margin: 0;
  accent-color: var(--purple);
}
.clock {
  font-family: var(--mono);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.failure {
  padding: 4px 8px;
  border-radius: 8px;
  background: var(--red);
  color: var(--red-bg);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  animation: pulse 1s infinite;
}
.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 14px;
}
@container (min-width: 820px) {
  .layout {
    grid-template-columns: minmax(0, 1fr) 260px;
  }
}
.main {
  display: grid;
  gap: 12px;
  min-width: 0;
}
.arch {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 8px 0;
  padding: 14px;
  border: 2px solid var(--border);
  border-radius: 16px;
  background: var(--bg-deep);
}
.stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1 1 150px;
  min-width: 0;
}
.node {
  width: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border: 2px solid var(--border);
  border-radius: 14px;
  background: var(--surface);
  transition: border-color 0.2s, background 0.2s;
}
.node.sources {
  flex: 1 1 150px;
  width: auto;
}
.node.active {
  border-color: var(--purple);
}
.node.alert {
  border-color: var(--yellow);
  background: var(--yellow-bg);
}
.node.down {
  border-color: var(--red);
  background: var(--red-bg);
  color: var(--red-light);
}
.node.dashed {
  border-style: dashed;
  color: var(--faint);
}
.line {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--text-3);
  overflow-wrap: anywhere;
}
.node.down .line,
.node.dashed .line {
  color: inherit;
}
.wire {
  flex: 0 0 24px;
  align-self: center;
  height: 4px;
  border-radius: 999px;
  background: var(--border);
}
.wire.vertical {
  flex: none;
  width: 4px;
  height: 18px;
}
.wire.off {
  opacity: 0.4;
}
.charts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
}
.chart {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 10px 12px;
  border: 2px solid var(--border);
  border-radius: 16px;
  background: var(--surface-2);
}
.chart figcaption {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
  font-weight: 800;
}
.now {
  flex: none;
  font-family: var(--mono);
  color: var(--green-light);
}
.now.bad {
  color: var(--red-light);
}
.chart svg {
  display: block;
  width: 100%;
  height: auto;
}
.band {
  fill: var(--red);
  opacity: 0.14;
}
.base {
  stroke: var(--border);
  stroke-width: 1.5;
}
.limit {
  stroke: var(--yellow);
  stroke-width: 1.5;
  stroke-dasharray: 5 4;
}
.limit-label {
  fill: var(--yellow-light);
  font-family: var(--mono);
  font-size: 11px;
}
.series {
  fill: none;
  stroke: var(--purple-link);
  stroke-width: 2.5;
  stroke-linejoin: round;
}
.cursor {
  stroke: var(--text);
  stroke-width: 1;
  opacity: 0.4;
}
.clip-note {
  color: var(--muted);
  font-size: 12px;
}
.goals {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.goals li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 2px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  color: var(--muted);
  font-weight: 700;
  line-height: 1.35;
}
.goals li.ok {
  border-color: var(--green-border);
  background: var(--green-soft);
  color: var(--green-light);
}
.goals li.bad {
  border-color: var(--red-border);
  background: var(--red-bg);
  color: var(--red-light);
}
.mark {
  flex: none;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--border);
}
.ok .mark {
  background: var(--green-border);
}
.bad .mark {
  background: var(--red-border);
}
.goal-text {
  flex: 1;
}
.goal-value {
  flex: none;
  font-family: var(--mono);
  font-size: 13px;
}
.controls {
  display: grid;
  align-content: start;
  gap: 10px;
}
.group {
  display: grid;
  gap: 6px;
  padding: 10px;
  border: 2px solid var(--border);
  border-radius: 16px;
  background: var(--surface-2);
}
.group .label {
  padding: 0 2px 2px;
  color: var(--muted);
}
.option {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  min-height: 44px;
  padding: 8px 10px;
  border: 2px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
  color: var(--text-2);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.option strong {
  font-size: 14px;
}
.option span {
  font-size: 12px;
  opacity: 0.85;
}
.option.on {
  border-color: var(--purple);
  background: var(--purple);
  color: #fff;
}
.result {
  margin: 0;
  padding: 10px 14px;
  border-radius: 12px;
  font-weight: 700;
  line-height: 1.45;
}
.result.ok {
  background: var(--green-soft);
  color: var(--green-light);
}
.result.hint {
  background: var(--purple-soft);
  color: var(--text-2);
}
.hint-row {
  display: flex;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
@keyframes pulse {
  50% { opacity: 0.5; }
}
@media (prefers-reduced-motion: reduce) {
  .failure { animation: none; }
  .node { transition: none; }
}
</style>
