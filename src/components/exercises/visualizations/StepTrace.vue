<script setup>
import { t } from '../../../lib/i18n.js'
import { computed, ref, watch } from 'vue'
import Markdown from '../../Markdown.vue'
import CodeBlock from '../../CodeBlock.vue'
import StepControls from './StepControls.vue'

const props = defineProps({
  config: { type: Object, required: true },
  codeLanguage: { type: String, default: 'javascript' },
})
const index = ref(0)
watch(() => props.config, () => { index.value = 0 })
const step = computed(() => props.config.steps[index.value])

// Zmienne znane do tego kroku: ostatnia wartość, czy zmieniła się teraz i historia wartości.
const variables = computed(() => {
  const known = new Map()
  let previous = new Map()
  props.config.steps.slice(0, index.value + 1).forEach((s) => {
    previous = new Map([...known].map(([name, entry]) => [name, entry.value]))
    for (const { name, value } of s.variables) {
      const entry = known.get(name) ?? { name, history: [] }
      if (entry.history.at(-1) !== value) entry.history.push(value)
      entry.value = value
      known.set(name, entry)
    }
  })
  return [...known.values()].map((entry) => ({
    ...entry,
    changed: index.value > 0 && previous.get(entry.name) !== entry.value,
  }))
})
</script>

<template>
  <section class="card viz trace" :aria-label="t('Przebieg krok po kroku')">
    <Markdown v-if="config.instruction" class="instruction" :src="config.instruction" />
    <div class="layout">
      <CodeBlock :code="config.code" :language="codeLanguage" :file-name="t('przykład')" :active-line="step.line" />
      <div class="state">
        <div v-if="variables.length" class="vars">
          <div v-for="v in variables" :key="v.name" class="var" :class="{ changed: v.changed }">
            <span class="name">{{ v.name }}</span>
            <span :key="v.value" class="value">{{ v.value }}</span>
            <span v-if="v.history.length > 1" class="history" :aria-label="t('Historia {0}', [v.name])">{{ v.history.join(' → ') }}</span>
          </div>
        </div>
        <div v-if="step.output || config.steps.some((s) => s.output)" class="console" :aria-label="t('Wyjście programu')">
          <span class="prompt" aria-hidden="true">›</span><span class="out">{{ step.output }}</span>
        </div>
      </div>
    </div>
    <div class="note" aria-live="polite"><Markdown :src="step.say" inline tag="span" /></div>
    <StepControls v-model="index" :total="config.steps.length" />
  </section>
</template>

<style scoped>
.trace {
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
  gap: 12px;
  align-items: start;
}
.state {
  display: grid;
  gap: 10px;
}
.vars {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 8px;
}
.var {
  display: grid;
  justify-items: center;
  gap: 2px;
  padding: 10px;
  border: 2px solid var(--border);
  border-bottom-width: 5px;
  border-radius: 14px;
  background: var(--surface-2);
  transition: border-color 0.2s, background 0.2s;
}
.var.changed {
  border-color: var(--yellow);
  background: var(--yellow-bg);
}
.name {
  font-family: var(--mono);
  font-size: 13px;
  color: var(--muted);
}
.value {
  font-family: var(--mono);
  font-size: 24px;
  font-weight: 700;
  overflow-wrap: anywhere;
  text-align: center;
  animation: bump 0.3s ease-out;
}
.var.changed .value {
  color: var(--yellow-light);
}
.history {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--faint);
  text-align: center;
  overflow-wrap: anywhere;
}
.console {
  display: flex;
  gap: 8px;
  min-height: 44px;
  padding: 10px 14px;
  border: 2px solid var(--border);
  border-radius: 14px;
  background: var(--bg-deep);
  font-family: var(--mono);
  font-size: 15px;
}
.prompt {
  color: var(--faint);
}
.out {
  color: var(--green-light);
  white-space: pre-wrap;
}
.note {
  padding: 10px 14px;
  border-radius: 12px;
  background: var(--purple-soft);
  color: var(--text-2);
  font-weight: 700;
}
@keyframes bump {
  0% { transform: scale(0.7); opacity: 0; }
  70% { transform: scale(1.1); }
}
@media (prefers-reduced-motion: reduce) {
  .value { animation: none; }
}
@media (max-width: 720px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
