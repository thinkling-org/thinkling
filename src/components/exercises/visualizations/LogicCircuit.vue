<script setup>
import { t } from '../../../lib/i18n.js'
import { computed, ref, watch } from 'vue'
import Markdown from '../../Markdown.vue'

const props = defineProps({ config: { type: Object, required: true } })
const initial = () => Object.fromEntries(props.config.inputs.map((input) => [input.id, input.on ? 1 : 0]))
const state = ref(initial())
watch(() => props.config, () => { state.value = initial() })

const outputs = computed(() => props.config.outputs.map((output) => ({ ...output, value: output.evaluate(state.value) })))
const pattern = computed(() => props.config.inputs.map((input) => state.value[input.id]).join(''))
const note = computed(() => props.config.notes.find((n) => n.pattern === pattern.value)?.say ?? '')

// Tabela prawdy ma sens dla małej liczby wejść; przy 4 wejściach to wciąż 16 wierszy.
const table = computed(() => {
  const { inputs } = props.config
  if (inputs.length > 3) return []
  return Array.from({ length: 2 ** inputs.length }, (_, row) => {
    const env = Object.fromEntries(inputs.map((input, k) => [input.id, (row >> (inputs.length - 1 - k)) & 1]))
    return {
      key: inputs.map((input) => env[input.id]).join(''),
      inputs: inputs.map((input) => env[input.id]),
      outputs: props.config.outputs.map((output) => output.evaluate(env)),
    }
  })
})

function toggle(id) {
  state.value = { ...state.value, [id]: state.value[id] ? 0 : 1 }
}
</script>

<template>
  <section class="card viz circuit" :aria-label="t('Interaktywny schemat')">
    <Markdown class="instruction" :src="config.instruction" />
    <div class="layout">
      <div class="board">
        <div class="inputs" role="group" :aria-label="t('Wejścia')">
          <button
            v-for="input in config.inputs"
            :key="input.id"
            type="button"
            class="switch"
            :class="{ on: state[input.id] }"
            :aria-pressed="!!state[input.id]"
            @click="toggle(input.id)"
          >
            <span class="switch-label">{{ input.label }}</span>
            <span class="switch-value">{{ state[input.id] }}</span>
          </button>
        </div>
        <ul class="outputs" aria-live="polite">
          <li v-for="output in outputs" :key="output.label">
            <span class="wire" :class="{ on: output.value }" aria-hidden="true" />
            <span class="gate">
              <strong>{{ output.label }}</strong>
              <code>{{ output.expression }}</code>
            </span>
            <span class="wire short" :class="{ on: output.value }" aria-hidden="true" />
            <span class="lamp" :class="{ on: output.value }" :aria-label="`${output.label}: ${output.value}`">{{ output.value }}</span>
          </li>
        </ul>
      </div>
      <div v-if="table.length" class="table-wrap">
        <table>
          <caption class="label">{{ t('Tabela prawdy') }}</caption>
          <thead>
            <tr>
              <th v-for="input in config.inputs" :key="input.id" scope="col">{{ input.id }}</th>
              <th v-for="output in config.outputs" :key="output.label" scope="col">{{ output.label }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in table" :key="row.key" :class="{ current: row.key === pattern }">
              <td v-for="(v, k) in row.inputs" :key="`i${k}`">{{ v }}</td>
              <td v-for="(v, k) in row.outputs" :key="`o${k}`" class="out">{{ v }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <p v-if="note" class="note" aria-live="polite">{{ note }}</p>
  </section>
</template>

<style scoped>
.circuit {
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
  grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}
.board {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  padding: 16px;
  border: 2px solid var(--border);
  border-bottom-width: 5px;
  border-radius: 16px;
  background: var(--surface-2);
}
.inputs {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.switch {
  display: grid;
  justify-items: center;
  gap: 2px;
  min-width: 104px;
  padding: 10px 14px;
  border: 2px solid var(--border);
  border-bottom-width: 6px;
  border-radius: 14px;
  background: var(--surface);
  color: var(--text-3);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.switch.on {
  border-color: var(--yellow-dark);
  background: var(--yellow);
  color: var(--yellow-bg);
}
.switch-label {
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.switch-value {
  font-family: var(--mono);
  font-size: 28px;
  font-weight: 700;
}
.outputs {
  flex: 1;
  min-width: 220px;
  display: grid;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.outputs li {
  display: flex;
  align-items: center;
}
.wire {
  flex: none;
  width: 28px;
  height: 6px;
  border-radius: 999px;
  background: var(--border);
  transition: background 0.15s, box-shadow 0.15s;
}
.wire.short {
  width: 20px;
}
.wire.on {
  background: var(--yellow);
  box-shadow: 0 0 10px color-mix(in srgb, var(--yellow) 60%, transparent);
}
.gate {
  flex: 1;
  display: grid;
  justify-items: center;
  gap: 2px;
  min-height: 60px;
  padding: 8px 14px;
  border: 2px solid var(--border);
  border-radius: 14px 32px 32px 14px;
  background: var(--surface);
  text-align: center;
}
.gate code {
  color: var(--muted);
  font-size: 13px;
  overflow-wrap: anywhere;
}
.lamp {
  flex: none;
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border: 2px solid var(--border);
  border-radius: 50%;
  background: var(--surface);
  color: var(--faint);
  font-family: var(--mono);
  font-weight: 700;
  transition: all 0.15s;
}
.lamp.on {
  border-color: var(--yellow);
  background: var(--yellow);
  color: var(--yellow-bg);
  box-shadow: 0 0 22px color-mix(in srgb, var(--yellow) 70%, transparent);
}
.table-wrap {
  padding: 12px;
  border: 2px solid var(--border);
  border-bottom-width: 5px;
  border-radius: 16px;
  background: var(--surface-2);
  overflow-x: auto;
}
table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0 4px;
  font-family: var(--mono);
  text-align: center;
}
caption {
  padding-bottom: 6px;
  color: var(--muted);
  text-align: left;
}
th {
  color: var(--muted);
  font-size: 12px;
}
td {
  padding: 6px 4px;
  color: var(--muted);
  font-weight: 700;
}
tr.current td {
  background: var(--purple-soft);
  color: var(--text);
}
tr.current td:first-child {
  border-radius: 10px 0 0 10px;
}
tr.current td:last-child {
  border-radius: 0 10px 10px 0;
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
