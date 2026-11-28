<script setup lang="ts">
import { t } from './messages.ts'
import { computed, inject, ref, watch } from 'vue'
import Markdown from '../../components/Markdown.vue'
import Icon from '../../components/Icon.vue'
import { BLOCK_CONTEXT } from '../vue-block.ts'
import type { PropType } from 'vue'
import type { BlockMode, GradeResult } from '../types.ts'
import { UiButton } from '../../components/ui/index.ts'

const props = defineProps({
  config: { type: Object as PropType<{ instruction: string; success?: string; hint?: string; steps: { text: string; indent: number }[] }>, required: true },
  mode: { type: String as PropType<BlockMode>, default: 'visualization' },
  // Exercise mode: the learner's saved order and, once checked, the app's grade.
  answer: { type: Array as PropType<number[]>, default: null },
  result: { type: Object as PropType<GradeResult>, default: null },
})
const ctx = inject(BLOCK_CONTEXT, null)
const isExercise = computed(() => props.mode === 'exercise')

// Shuffle deterministically so the same lesson always starts with the same order.
function shuffle(count, seedText) {
  let seed = [...seedText].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7)
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
  const order = Array.from({ length: count }, (_, i) => i)
  for (let attempt = 0; attempt < 5; attempt++) {
    for (let i = count - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      ;[order[i], order[j]] = [order[j], order[i]]
    }
    if (order.some((id, i) => id !== i)) break
  }
  return order
}

const bank = computed(() => shuffle(props.config.steps.length, props.config.steps.map((s) => s.text).join('|')))
const placed = ref(isExercise.value && Array.isArray(props.answer) ? [...props.answer] : [])
// As a visualization the block checks itself; as an exercise the app grades and passes the result.
const selfChecked = ref(false)
const checked = computed(() => (isExercise.value ? !!props.result : selfChecked.value))
watch(() => props.config, reset)
watch(placed, (order) => {
  if (isExercise.value) ctx?.answer([...order], { complete: order.length === props.config.steps.length })
}, { immediate: true })

const full = computed(() => placed.value.length === props.config.steps.length)
const good = computed(() => placed.value.filter((id, slot) => id === slot).length)
const solved = computed(() => checked.value && good.value === props.config.steps.length)
const slots = computed(() => props.config.steps.map((_, slot) => {
  const id = placed.value[slot]
  return id === undefined ? null : { id, ...props.config.steps[id], ok: id === slot }
}))

function add(id) {
  if (!checked.value && !placed.value.includes(id)) placed.value = [...placed.value, id]
}
function remove(slot) {
  if (!checked.value) placed.value = placed.value.filter((_, k) => k !== slot)
}
function retry() {
  placed.value = placed.value.filter((id, slot) => id === slot && placed.value.slice(0, slot).every((p, k) => p === k))
  selfChecked.value = false
}
function reset() {
  placed.value = []
  selfChecked.value = false
}
</script>

<template>
  <section class="card viz ordering" :aria-label="t('Put the steps in order')">
    <Markdown v-if="config.instruction" class="instruction" :src="config.instruction" />
    <div class="layout">
      <ol class="slots" :aria-label="t('Your order')">
        <li v-for="(slot, k) in slots" :key="k">
          <span class="no" aria-hidden="true">{{ k + 1 }}</span>
          <button
            v-if="slot"
            type="button"
            class="piece placed"
            :class="checked && (slot.ok ? 'ok' : 'bad')"
            :disabled="checked"
            :aria-label="checked ? `${slot.text}: ${slot.ok ? t('right position') : t('wrong position')}` : t('Undo: {0}', [slot.text])"
            @click="remove(k)"
          >
            <span :style="{ paddingLeft: `${slot.indent * 18}px` }">{{ slot.text }}</span>
            <Icon :name="checked ? (slot.ok ? 'check' : 'x') : 'x'" :size="16" :stroke="2.8" />
          </button>
          <span v-else class="empty" :aria-label="t('Empty slot')" />
        </li>
      </ol>
      <div class="bank-wrap">
        <span class="label">{{ t('Blocks · click to add') }}</span>
        <div class="bank" role="group" :aria-label="t('Blocks to arrange')">
          <button
            v-for="id in bank"
            :key="id"
            type="button"
            class="piece"
            :class="{ used: placed.includes(id) }"
            :disabled="placed.includes(id) || checked"
            @click="add(id)"
          >{{ config.steps[id].text }}</button>
        </div>
        <div v-if="isExercise" class="actions">
          <UiButton variant="ghost" size="sm" :disabled="checked" @click="reset">{{ t('Start over') }}</UiButton>
        </div>
        <div v-else class="actions">
          <UiButton variant="ghost" size="sm" @click="reset">{{ t('Start over') }}</UiButton>
          <UiButton v-if="checked && !solved" variant="ghost-yellow" size="sm" @click="retry">{{ t('Revise') }}</UiButton>
          <UiButton v-else variant="primary" size="sm" :disabled="!full || checked" @click="selfChecked = true">{{ t('Check') }}</UiButton>
        </div>
      </div>
    </div>
    <!-- As an exercise the lesson footer gives the verdict; the block only explains how to use it. -->
    <p v-if="isExercise" class="note" aria-live="polite">
      <template v-if="!checked">{{ full ? t('All steps are placed. Check your order.') : t('Click a block to append it. Click a placed block to undo it.') }}</template>
      <template v-else>{{ good }} {{ t('of') }} {{ config.steps.length }} {{ t('in the right position.') }}</template>
    </p>
    <p v-else class="note" :class="checked && (solved ? 'success' : 'warn')" aria-live="polite">
      <template v-if="!checked">{{ full ? t('Ready? Click Check.') : t('Click a block to append it. Click a placed block to undo it.') }}</template>
      <template v-else-if="solved">{{ config.success || t('Good work. Every step is in the right position.') }}</template>
      <template v-else>{{ good }} {{ t('of') }} {{ config.steps.length }} {{ t('in the right position.') }} {{ config.hint }}</template>
    </p>
  </section>
</template>

<style scoped>
.ordering {
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
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}
.slots {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 14px;
  list-style: none;
  border: 2px solid var(--border);
  border-bottom-width: 5px;
  border-radius: 16px;
  background: var(--surface-2);
}
.slots li {
  display: flex;
  align-items: center;
  gap: 10px;
}
.no {
  width: 22px;
  flex: none;
  text-align: right;
  color: var(--faint);
  font-weight: 900;
}
.empty {
  flex: 1;
  height: 44px;
  border: 2px dashed var(--border);
  border-radius: 12px;
}
.bank-wrap {
  display: grid;
  gap: 8px;
}
.bank-wrap .label {
  color: var(--muted);
}
.bank {
  display: grid;
  gap: 8px;
}
.piece {
  min-height: 44px;
  padding: 8px 14px;
  border: 2px solid var(--border);
  border-bottom-width: 4px;
  border-radius: 12px;
  background: var(--surface);
  color: var(--text);
  font-family: var(--mono);
  font-size: 14px;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}
.piece.used {
  border-style: dashed;
  border-bottom-width: 2px;
  background: transparent;
  color: transparent;
  cursor: default;
}
.piece.placed {
  flex: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  border-color: var(--purple);
  background: var(--purple-soft);
  animation: enter 0.2s ease-out;
}
.piece.placed:disabled {
  cursor: default;
}
.piece.ok {
  border-color: var(--green);
  background: var(--green-soft);
  color: var(--green-light);
}
.piece.bad {
  border-color: var(--red);
  background: var(--red-soft);
  color: var(--red-light);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.actions > :last-child {
  flex: 1;
}
.note {
  margin: 0;
  padding: 10px 14px;
  border-radius: 12px;
  background: var(--purple-soft);
  color: var(--text-2);
  font-weight: 700;
}
.note.success {
  background: var(--green-soft);
  color: var(--green-light);
}
.note.warn {
  background: var(--yellow-bg);
  color: var(--yellow-light);
}
@keyframes enter {
  from { transform: scale(0.95); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .piece.placed { animation: none; }
}
@media (max-width: 720px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
