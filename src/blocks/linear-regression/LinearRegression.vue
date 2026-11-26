<script setup lang="ts">
import { numberFormatter, uiLocale } from '../../lib/i18n.ts'
import { t } from './messages.ts'
import { computed, onBeforeUnmount, onMounted, ref, watch, watchPostEffect } from 'vue'
import { evaluateRegression } from './regression.ts'
import Markdown from '../../components/Markdown.vue'

const props = defineProps({ config: { type: Object, required: true } })
const canvas = ref(null)
const size = ref({ width: 0, height: 0 })
const parameters = ref({ ...props.config.model.initial })
const result = computed(() => evaluateRegression(props.config.model, parameters.value))
const tickFormat = numberFormatter({ notation: 'compact', maximumSignificantDigits: 4 })
const numberFormat = numberFormatter({ maximumSignificantDigits: 6 })
const sliderSteps = 1000
let resizeObserver
let animation

function formatNumber(value, formatter = numberFormat) {
  const magnitude = Math.abs(value)
  return magnitude && (magnitude < 0.001 || magnitude >= 1e9)
    ? value.toExponential(2).replace('.', uiLocale() === 'pl' ? ',' : '.')
    : formatter(value)
}

function sliderPosition(value, [min, max]) {
  return Math.round((value - min) / (max - min) * sliderSteps)
}

function updateParameter(key, [min, max], position) {
  cancelAnimationFrame(animation)
  parameters.value[key] = min + (max - min) * (Number(position) / sliderSteps)
}

function showBestFit() {
  cancelAnimationFrame(animation)
  const { fit } = props.config.model
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    parameters.value = { ...fit }
    return
  }
  const origin = { ...parameters.value }
  const beganAt = performance.now()
  const advance = (now) => {
    const progress = Math.min((now - beganAt) / 320, 1)
    if (progress >= 1) {
      parameters.value = { ...fit }
      return
    }
    const eased = 1 - (1 - progress) ** 3
    parameters.value = {
      start: origin.start + (fit.start - origin.start) * eased,
      rise: origin.rise + (fit.rise - origin.rise) * eased,
    }
    animation = requestAnimationFrame(advance)
  }
  animation = requestAnimationFrame(advance)
}

watch(() => props.config.model, (model) => {
  cancelAnimationFrame(animation)
  parameters.value = { ...model.initial }
})

onMounted(() => {
  const plot = canvas.value
  const measure = () => {
    size.value = { width: plot.clientWidth, height: plot.clientHeight }
  }
  measure()
  resizeObserver = new ResizeObserver(measure)
  resizeObserver.observe(plot)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  cancelAnimationFrame(animation)
})

watchPostEffect(() => {
  const plot = canvas.value
  const { width, height } = size.value
  if (!plot || !width || !height) return
  const ctx = plot.getContext('2d')
  if (!ctx) return
  const style = getComputedStyle(plot)
  const color = (name) => style.getPropertyValue(name).trim()
  const scale = Math.min(window.devicePixelRatio || 1, 2)
  const pixelWidth = Math.round(width * scale)
  const pixelHeight = Math.round(height * scale)
  if (plot.width !== pixelWidth) plot.width = pixelWidth
  if (plot.height !== pixelHeight) plot.height = pixelHeight
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  ctx.clearRect(0, 0, width, height)
  ctx.font = `600 12px ${style.fontFamily}`

  const { xMin, xSpan, yRange: [yMin, yMax] } = props.config.model
  const xTicks = width < 440 ? 2 : 4
  const gridLabel = (value) => formatNumber(value, tickFormat)
  const yLabels = Array.from({ length: 5 }, (_, index) => gridLabel(yMin + (yMax - yMin) * index / 4))
  const xLabels = Array.from({ length: xTicks + 1 }, (_, index) => gridLabel(xMin + xSpan * (index / xTicks)))
  const yLabelWidth = Math.max(...yLabels.map((label) => ctx.measureText(label).width))
  const left = Math.max(yLabelWidth + 12, ctx.measureText(xLabels[0]).width / 2 + 6)
  const right = width - ctx.measureText(xLabels.at(-1)).width / 2 - 6
  const top = 12
  const bottom = height - 25
  const x = (fraction) => left + (right - left) * fraction
  const y = (value) => bottom - (bottom - top) * ((value - yMin) / (yMax - yMin))
  const segment = (x1, y1, x2, y2) => {
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
  }

  ctx.fillStyle = color('--muted')
  ctx.strokeStyle = color('--border')
  ctx.lineWidth = 1
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  ctx.beginPath()
  yLabels.forEach((label, index) => {
    const position = bottom - (bottom - top) * (index / 4)
    segment(left, position, right, position)
    ctx.fillText(label, left - 8, position)
  })
  segment(left, top, left, bottom)
  ctx.stroke()
  ctx.textAlign = 'center'
  xLabels.forEach((label, index) => ctx.fillText(label, x(index / xTicks), bottom + 14))

  ctx.save()
  ctx.beginPath()
  ctx.rect(left - 5, top - 5, right - left + 10, bottom - top + 10)
  ctx.clip()
  const { rows } = result.value
  ctx.strokeStyle = color('--muted')
  ctx.setLineDash([4, 4])
  ctx.beginPath()
  for (const row of rows) {
    const px = x(row.xFraction)
    segment(px, y(row.y), px, y(row.predicted))
  }
  ctx.stroke()

  const { start, rise } = parameters.value
  ctx.strokeStyle = color('--blue')
  ctx.lineWidth = 3
  ctx.setLineDash([])
  ctx.beginPath()
  segment(left, y(start), right, y(start + rise))
  ctx.stroke()

  ctx.fillStyle = color('--yellow')
  ctx.strokeStyle = color('--surface')
  ctx.lineWidth = 1.5
  for (const row of rows) {
    ctx.beginPath()
    ctx.arc(x(row.xFraction), y(row.y), 4.5, 0, 2 * Math.PI)
    ctx.fill()
    ctx.stroke()
  }
  ctx.restore()
})

const slope = computed(() => parameters.value.rise / props.config.model.xSpan)
</script>

<template>
  <section class="card viz regression" :aria-label="t('Fit a line to the data')">
    <Markdown class="instruction" :src="config.instruction" />
    <div>
      <div class="axis-label">{{ config.yLabel }}</div>
      <canvas ref="canvas" class="plot" role="img" :aria-label="t('Fit chart. Horizontal axis: {0}. Vertical axis: {1}.', [config.xLabel, config.yLabel])" />
      <div class="axis-label x-label">{{ config.xLabel }}</div>
    </div>
    <ul class="legend" :aria-label="t('Legend')">
      <li><span class="key point" aria-hidden="true"></span>{{ t('Observation') }}</li>
      <li><span class="key fit" aria-hidden="true"></span>{{ t('Fitted line') }}</li>
      <li><span class="key residual" aria-hidden="true"></span>{{ t('Prediction error') }}</li>
    </ul>
    <div class="controls">
      <label>
        <span>{{ t('Slope') }} <strong>{{ formatNumber(slope) }}</strong></span>
        <input
          type="range"
          min="0"
          :max="sliderSteps"
          :value="sliderPosition(parameters.rise, config.model.riseRange)"
          :aria-valuetext="formatNumber(slope)"
          @input="updateParameter('rise', config.model.riseRange, ($event.target as HTMLInputElement).value)"
        />
      </label>
      <label>
        <span>{{ t('Height at x =') }} {{ formatNumber(config.model.xMin) }} <strong>{{ formatNumber(parameters.start) }}</strong></span>
        <input
          type="range"
          min="0"
          :max="sliderSteps"
          :value="sliderPosition(parameters.start, config.model.startRange)"
          :aria-valuetext="t('{0} at x = {1}', [formatNumber(parameters.start), formatNumber(config.model.xMin)])"
          @input="updateParameter('start', config.model.startRange, ($event.target as HTMLInputElement).value)"
        />
      </label>
    </div>
    <div class="actions">
      <button type="button" class="btn btn-primary btn-sm" @click="showBestFit">{{ t('Show best fit') }}</button>
      <div class="error">{{ t('Mean squared error') }} <output>{{ formatNumber(result.mse) }}</output></div>
    </div>
    <details class="values">
      <summary>{{ t('Show data and predictions') }}</summary>
      <div class="table-scroll">
        <table>
          <thead>
            <tr><th scope="col">{{ config.xLabel }}</th><th scope="col">{{ config.yLabel }}</th><th scope="col">{{ t('Prediction') }}</th><th scope="col">{{ t('Difference') }}</th></tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in result.rows" :key="index">
              <td>{{ formatNumber(row.x) }}</td>
              <td>{{ formatNumber(row.y) }}</td>
              <td>{{ formatNumber(row.predicted) }}</td>
              <td>{{ formatNumber(row.residual) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  </section>
</template>

<style scoped>
.regression {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 14px;
  min-width: 0;
  padding: clamp(12px, 3vw, 20px);
}
.instruction {
  color: var(--text-2);
}
.plot {
  display: block;
  width: 100%;
  height: clamp(205px, 35vw, 270px);
}
.axis-label,
.legend,
.values {
  color: var(--muted);
  font-size: 14px;
}
.axis-label {
  overflow-wrap: anywhere;
}
.x-label {
  text-align: right;
}
.legend,
.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
}
.legend {
  list-style: none;
  margin: 0;
  padding: 0;
}
.legend li {
  display: flex;
  align-items: center;
  gap: 6px;
}
.key {
  display: inline-block;
  width: 17px;
}
.point {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--yellow);
}
.fit {
  border-top: 3px solid var(--blue);
}
.residual {
  border-top: 2px dashed var(--muted);
}
.controls {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 205px), 1fr));
  gap: 10px 20px;
}
.controls label {
  display: grid;
  gap: 4px;
}
.controls label span {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.controls input {
  width: 100%;
  min-width: 0;
  margin: 0;
  accent-color: var(--blue);
}
.controls strong,
.error output,
td {
  font-variant-numeric: tabular-nums;
}
.error {
  color: var(--muted);
}
.error output {
  padding-left: 5px;
  color: var(--text);
  font-weight: 800;
}
.values summary {
  cursor: pointer;
}
.table-scroll {
  overflow-x: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 8px;
  color: var(--text-2);
  text-align: right;
}
th,
td {
  border-bottom: 1px solid var(--border);
  padding: 4px 6px;
}
</style>
