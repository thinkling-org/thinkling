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
const picked = ref(null)
watch(() => props.config, () => { index.value = 0 })
watch(index, () => { picked.value = null })

const step = computed(() => props.config.steps[index.value])
const isStack = computed(() => props.config.layout === 'stack')
// Render the stack from the end so the active frame appears at the top.
const items = computed(() => {
  const all = step.value.items.map((item, position) => ({ ...item, position }))
  return isStack.value ? all.reverse() : all
})
const defaultPick = computed(() => (isStack.value ? step.value.items.length - 1 : 0))
const selected = computed(() => {
  const position = picked.value ?? defaultPick.value
  return step.value.items[position] ? position : null
})
const detail = computed(() => (selected.value === null ? null : step.value.items[selected.value]))
const hint = { stack: t('top = active'), queue: t('first in, first out'), list: '' }
</script>

<template>
  <section class="card viz inspector" :aria-label="t('State inspector')">
    <Markdown v-if="config.instruction" class="instruction" :src="config.instruction" />
    <div class="layout" :class="{ solo: !config.code }">
      <CodeBlock v-if="config.code" :code="config.code" :language="codeLanguage" :file-name="t('example')" :active-line="step.line" />
      <div class="panel">
        <div class="panel-head label">
          <span>{{ config.label }}</span><span v-if="hint[config.layout]" class="hint">{{ hint[config.layout] }}</span>
        </div>
        <div class="items" :class="config.layout" role="group" :aria-label="config.label">
          <p v-if="!items.length" class="empty">{{ t('Empty') }}</p>
          <button
            v-for="item in items"
            :key="`${index}-${item.position}`"
            type="button"
            class="item"
            :class="{ on: item.position === selected }"
            :style="isStack ? { marginLeft: `${item.position * 10}px` } : null"
            :aria-pressed="item.position === selected"
            @click="picked = item.position"
          >
            <span class="item-label">{{ item.label }}</span>
            <span v-if="item.status" class="status">{{ item.status }}</span>
          </button>
        </div>
        <dl v-if="detail?.details.length" class="details">
          <div v-for="d in detail.details" :key="d.name">
            <dt>{{ d.name }}</dt>
            <dd>{{ d.value }}</dd>
          </div>
        </dl>
      </div>
    </div>
    <div class="note" aria-live="polite"><Markdown :src="step.say" inline tag="span" /></div>
    <StepControls v-model="index" :total="config.steps.length" />
  </section>
</template>

<style scoped>
.inspector {
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
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}
.layout.solo {
  grid-template-columns: minmax(0, 1fr);
}
.panel {
  display: grid;
  gap: 10px;
  padding: 14px;
  border: 2px solid var(--border);
  border-bottom-width: 5px;
  border-radius: 16px;
  background: var(--surface-2);
}
.panel-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  color: var(--muted);
}
.hint {
  text-transform: none;
  letter-spacing: 0;
}
.items {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 120px;
  justify-content: flex-end;
}
.items.queue,
.items.list {
  justify-content: flex-start;
}
.items.queue {
  flex-direction: row;
  flex-wrap: wrap;
  align-items: flex-start;
  min-height: 0;
}
.empty {
  margin: auto;
  color: var(--green-light);
  font-weight: 800;
}
.item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 4px 12px;
  min-height: 48px;
  padding: 10px 14px;
  border: 2px solid var(--border);
  border-bottom-width: 5px;
  border-radius: 14px;
  background: var(--surface);
  text-align: left;
  cursor: pointer;
  animation: enter 0.25s ease-out;
}
.item.on {
  border-color: var(--purple);
  background: var(--purple-soft);
}
.item-label {
  font-family: var(--mono);
  font-weight: 700;
  overflow-wrap: anywhere;
}
.status {
  color: var(--muted);
  font-size: 13px;
  font-weight: 800;
}
.details {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 10px;
  margin: 0;
  padding: 12px 14px;
  border: 2px solid var(--purple);
  border-radius: 14px;
  background: var(--bg-deep);
}
dt {
  color: var(--muted);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
dd {
  margin: 2px 0 0;
  font-family: var(--mono);
  font-size: 17px;
  font-weight: 700;
  color: var(--yellow-light);
  overflow-wrap: anywhere;
}
.note {
  padding: 10px 14px;
  border-radius: 12px;
  background: var(--purple-soft);
  color: var(--text-2);
  font-weight: 700;
}
@keyframes enter {
  from { transform: translateY(-10px); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .item { animation: none; }
}
@media (max-width: 720px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
