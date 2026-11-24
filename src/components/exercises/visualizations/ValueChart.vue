<script setup>
import { numberFormatter, t } from '../../../lib/i18n.js'
import { computed, ref, useId, watch } from 'vue'
import Markdown from '../../Markdown.vue'

const props = defineProps({ config: { type: Object, required: true } })
const COLORS = ['var(--blue)', 'var(--green)', 'var(--yellow)', 'var(--red)', 'var(--purple-link)', 'var(--flame)']
const DASHES = ['', '8 5', '', '3 4', '', '10 4 2 4']
const clipId = useId()
const W = 560
const H = 300
const PAD = { left: 52, right: 14, top: 14, bottom: 30 }
const numberFormat = numberFormatter({ maximumFractionDigits: 2 })
const tickFormat = numberFormatter({ notation: 'compact', maximumSignificantDigits: 3 })

const index = ref(Math.floor((props.config.xs.length - 1) / 3))
watch(() => props.config, (config) => { index.value = Math.floor((config.xs.length - 1) / 3) })

const xs = computed(() => props.config.xs)
const xMin = computed(() => xs.value[0])
const xMax = computed(() => xs.value.at(-1))
const yMin = computed(() => Math.min(0, ...props.config.series.flatMap((s) => s.values)))
const yMax = computed(() => props.config.yMax ?? Math.max(...props.config.series.flatMap((s) => s.values), yMin.value + 1))
const px = (x) => PAD.left + (x - xMin.value) / (xMax.value - xMin.value) * (W - PAD.left - PAD.right)
const py = (y) => H - PAD.bottom - (y - yMin.value) / (yMax.value - yMin.value) * (H - PAD.top - PAD.bottom)

const series = computed(() => props.config.series.map((s, k) => ({
  ...s,
  color: COLORS[k % COLORS.length],
  dash: DASHES[k % DASHES.length],
  path: s.values.map((v, i) => `${i ? 'L' : 'M'}${px(xs.value[i]).toFixed(1)} ${py(v).toFixed(1)}`).join(' '),
  value: s.values[index.value],
  off: s.values[index.value] > yMax.value,
})))
const yTicks = computed(() => Array.from({ length: 5 }, (_, i) => yMin.value + (yMax.value - yMin.value) * i / 4))
const cursorX = computed(() => px(xs.value[index.value]))
const note = computed(() => [...props.config.notes].reverse().find((n) => xs.value[index.value] >= n.from)?.say ?? '')
// Use a logarithmic scale to keep small and large values visible together.
const peak = computed(() => Math.max(...props.config.series.flatMap((s) => s.values.map(Math.abs)), 1))
const barWidth = (v) => `${Math.max(2, Math.log10(Math.abs(v) + 1) / Math.log10(peak.value + 1) * 100)}%`
</script>

<template>
  <section class="card viz chart" :aria-label="t('Interactive chart')">
    <Markdown class="instruction" :src="config.instruction" />
    <div class="layout">
      <div class="plot">
        <div class="axis-label">{{ config.yLabel }}</div>
        <svg :viewBox="`0 0 ${W} ${H}`" role="img" :aria-label="t('Chart: {0} versus {1}', [config.yLabel, config.xLabel])">
          <defs>
            <clipPath :id="clipId"><rect :x="PAD.left" :y="PAD.top - 4" :width="W - PAD.left - PAD.right" :height="H - PAD.top - PAD.bottom + 4" /></clipPath>
          </defs>
          <g class="grid">
            <template v-for="t in yTicks" :key="t">
              <line :x1="PAD.left" :x2="W - PAD.right" :y1="py(t)" :y2="py(t)" />
              <text :x="PAD.left - 8" :y="py(t) + 4" text-anchor="end">{{ tickFormat(t) }}</text>
            </template>
            <text :x="PAD.left" :y="H - 8">{{ tickFormat(xMin) }}</text>
            <text :x="W - PAD.right" :y="H - 8" text-anchor="end">{{ tickFormat(xMax) }}</text>
          </g>
          <line class="cursor" :x1="cursorX" :x2="cursorX" :y1="PAD.top" :y2="H - PAD.bottom" />
          <g :clip-path="`url(#${clipId})`">
            <path v-for="s in series" :key="s.label" :d="s.path" :style="{ stroke: s.color }" :stroke-dasharray="s.dash" class="line" />
            <template v-for="s in series" :key="`${s.label}-dot`">
              <circle v-if="!s.off" :cx="cursorX" :cy="py(s.value)" r="6" :style="{ fill: s.color }" class="dot" />
            </template>
          </g>
        </svg>
        <label class="slider">
          <span>{{ config.xLabel }} = <strong>{{ numberFormat(xs[index]) }}</strong></span>
          <input
            v-model.number="index"
            type="range"
            min="0"
            :max="xs.length - 1"
            step="1"
            :aria-valuetext="`${config.xLabel} ${numberFormat(xs[index])}`"
          />
        </label>
      </div>
      <ul class="values" :aria-label="t('Values for {0} = {1}', [config.xLabel, numberFormat(xs[index])])" aria-live="polite">
        <li v-for="s in series" :key="s.label" :class="{ off: s.off }">
          <div class="row">
            <span class="name"><svg width="18" height="8" aria-hidden="true"><line x1="0" x2="18" y1="4" y2="4" :style="{ stroke: s.color }" stroke-width="3" :stroke-dasharray="s.dash" /></svg><span>{{ s.label }}</span></span>
            <span class="value" :style="{ color: s.color }">{{ numberFormat(s.value) }}<template v-if="s.off"> ↑</template></span>
          </div>
          <div class="bar"><div :style="{ width: barWidth(s.value), background: s.color }" /></div>
        </li>
      </ul>
    </div>
    <p v-if="note" class="note" aria-live="polite">{{ note }}</p>
  </section>
</template>

<style scoped>
.chart {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
  padding: clamp(12px, 3vw, 20px);
}
.instruction {
  color: var(--text-2);
}
.layout {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}
.plot {
  display: grid;
  gap: 6px;
  min-width: 0;
}
.plot > svg {
  display: block;
  width: 100%;
  height: auto;
}
.axis-label {
  color: var(--muted);
  font-size: 14px;
}
.grid line {
  stroke: var(--divider);
}
.grid text {
  fill: var(--muted);
  font-family: var(--mono);
  font-size: 12px;
}
.cursor {
  stroke: var(--purple);
  stroke-width: 2;
  stroke-dasharray: 4 4;
}
.line {
  fill: none;
  stroke-width: 3;
  stroke-linejoin: round;
}
.dot {
  stroke: var(--surface);
  stroke-width: 2;
}
.slider {
  display: grid;
  gap: 4px;
  font-family: var(--mono);
}
.slider input {
  width: 100%;
  margin: 0;
  height: 28px;
  accent-color: var(--purple);
}
.slider strong {
  color: var(--purple-light);
}
.values {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.values li {
  display: grid;
  gap: 6px;
  padding: 10px 12px;
  border: 2px solid var(--border);
  border-bottom-width: 4px;
  border-radius: 14px;
  background: var(--surface-2);
}
.values li.off {
  border-color: var(--red-border);
}
.row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-family: var(--mono);
  font-size: 14px;
  font-weight: 700;
}
.name {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.name svg {
  flex: none;
}
.value {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.bar {
  height: 6px;
  border-radius: 999px;
  background: var(--border);
  overflow: hidden;
}
.bar div {
  height: 100%;
  border-radius: inherit;
  transition: width 0.15s;
}
.note {
  margin: 0;
  padding: 10px 14px;
  border-radius: 12px;
  background: var(--purple-soft);
  color: var(--text-2);
  font-weight: 700;
}
@media (max-width: 720px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
