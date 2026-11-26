<script setup lang="ts">
import { onBeforeUnmount, onMounted, useTemplateRef } from 'vue'
import { t } from '../../lib/i18n.ts'
import Icon from '../Icon.vue'

defineProps<{ actions: { id: string; label: string }[] }>()
const emit = defineEmits<{ select: [id: string] }>()
const disclosure = useTemplateRef<HTMLDetailsElement>('disclosure')

function close() {
  if (disclosure.value) disclosure.value.open = false
}
function select(id: string) { close(); emit('select', id) }
function outside(event: PointerEvent) {
  if (event.target instanceof Node && !disclosure.value?.contains(event.target)) close()
}
function escape() { close(); disclosure.value?.querySelector('summary')?.focus() }
onMounted(() => document.addEventListener('pointerdown', outside))
onBeforeUnmount(() => document.removeEventListener('pointerdown', outside))
</script>

<template>
  <details ref="disclosure" class="more" @keydown.esc.stop.prevent="escape">
    <summary class="more-toggle"><Icon name="list" :size="17" />{{ t('More actions') }}</summary>
    <div class="more-panel" role="group" :aria-label="t('More actions')">
      <button v-for="action in actions" :key="action.id" type="button" @click="select(action.id)">{{ action.label }}</button>
    </div>
  </details>
</template>

<style scoped>
.more { position: relative; }
.more-toggle { display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 8px 12px; border-radius: 10px; color: var(--text-3); font-size: 14px; font-weight: 700; list-style: none; cursor: pointer; white-space: nowrap; }
.more-toggle::-webkit-details-marker { display: none; }
.more-toggle:hover, .more[open] .more-toggle { background: var(--surface); color: var(--text); }
.more-panel { position: absolute; bottom: calc(100% + 14px); right: 0; z-index: 1; width: max-content; min-width: 200px; max-width: min(280px, calc(100vw - 32px)); padding: 6px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); box-shadow: 0 8px 32px #0005; }
.more-panel button { display: block; width: 100%; padding: 11px 12px; border: 0; border-radius: 8px; background: transparent; color: var(--text-2); text-align: left; font: inherit; font-size: 14px; cursor: pointer; }
.more-panel button:hover { background: var(--purple-soft); color: var(--purple-light); }
</style>
