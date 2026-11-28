<script setup lang="ts" generic="V extends string | number">
import { computed, useId, useTemplateRef } from 'vue'
import type { TabItem } from './types.ts'

/**
 * A tab strip (WAI-ARIA tabs, automatic activation). Arrow keys, Home and End move
 * between tabs; with `closable`, Delete or a middle click closes a tab.
 * The panels stay with the parent: render them with v-show / v-if on the model.
 * Custom tab content goes in the `tab` slot; extra controls (status, buttons) in `end`,
 * which sits outside the tablist.
 */
const props = withDefaults(
  defineProps<{
    tabs: readonly TabItem<V>[]
    variant?: 'file' | 'panel'
    /** Accessible name of the tab list. */
    label?: string
    closable?: boolean
    /** Accessible name of a tab's close control. */
    closeLabel?: (tab: TabItem<V>) => string
  }>(),
  { variant: 'panel' },
)
const model = defineModel<V>({ required: true })
const emit = defineEmits<{ close: [value: V] }>()
defineSlots<{
  tab?(props: { tab: TabItem<V>; selected: boolean }): unknown
  end?(): unknown
}>()

const id = useId()
const buttons = useTemplateRef<HTMLButtonElement[]>('buttons')
const selectedIndex = computed(() => props.tabs.findIndex((tab) => tab.value === model.value))

function tabIndex(index: number) {
  const current = selectedIndex.value >= 0 ? selectedIndex.value : 0
  return index === current ? 0 : -1
}

function select(index: number, focus = false) {
  const tab = props.tabs[index]
  if (!tab) return
  model.value = tab.value
  if (focus) buttons.value?.[index]?.focus()
}

function onKeydown(event: KeyboardEvent, index: number) {
  const count = props.tabs.length
  const rtl = getComputedStyle(event.currentTarget as Element).direction === 'rtl'
  let next: number | null = null
  if (event.key === 'ArrowRight') next = index + (rtl ? -1 : 1)
  else if (event.key === 'ArrowLeft') next = index + (rtl ? 1 : -1)
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = count - 1
  else if (event.key === 'Delete' && props.closable) {
    event.preventDefault()
    emit('close', props.tabs[index].value)
    return
  }
  if (next === null) return
  event.preventDefault()
  select((next + count) % count, true)
}
</script>

<template>
  <div :class="['tabs', `tabs-${variant}`]">
    <div role="tablist" class="tabs-list" :aria-label="label || undefined">
      <div v-for="(tab, index) in tabs" :key="String(tab.value)" role="presentation" :class="['tab-item', { on: tab.value === model }]">
        <button
          :id="`${id}-tab-${index}`"
          ref="buttons"
          type="button"
          role="tab"
          class="tab"
          :aria-selected="tab.value === model"
          :aria-keyshortcuts="closable ? 'Delete' : undefined"
          :tabindex="tabIndex(index)"
          @click="select(index)"
          @keydown="onKeydown($event, index)"
          @auxclick="(event) => { if (closable && event.button === 1) { event.preventDefault(); emit('close', tab.value) } }"
        >
          <slot name="tab" :tab="tab" :selected="tab.value === model">{{ tab.label }}</slot>
        </button>
        <!-- Mouse affordance only: keyboard users close with Delete, so it stays out of the tablist's accessibility tree. -->
        <button
          v-if="closable"
          type="button"
          class="tab-close"
          tabindex="-1"
          aria-hidden="true"
          :title="closeLabel?.(tab)"
          @click="emit('close', tab.value)"
        >×</button>
      </div>
    </div>
    <slot name="end" />
  </div>
</template>

<style scoped>
.tabs {
  display: flex;
  align-items: center;
  border-bottom: 2px solid var(--divider);
}
.tabs-list {
  display: flex;
  min-width: 0;
}
.tab-item {
  position: relative;
  display: flex;
  align-items: center;
}
.tab {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  white-space: nowrap;
}
.tab-item.on .tab {
  color: var(--text);
}

/* File tabs: editor-style, accent on top, monospace. */
.tabs-file {
  background: var(--bg);
  overflow-x: auto;
}
.tabs-file .tab-item {
  border-top: 2px solid transparent;
}
.tabs-file .tab-item.on {
  background: var(--bg-deep);
  border-top-color: var(--color-accent);
}
.tabs-file .tab {
  padding: var(--space-3) 18px;
  font-family: var(--mono);
  font-size: var(--text-sm);
}
.tabs-file .tab-item:has(.tab-close) .tab {
  padding-right: var(--space-1);
}
.tab-close {
  margin-right: var(--space-2);
  padding: 0 var(--space-1);
  border: none;
  border-radius: var(--radius-xs);
  background: none;
  color: var(--muted);
  font: inherit;
  opacity: 0;
  cursor: pointer;
}
.tab-item:hover .tab-close,
.tab-item.on .tab-close {
  opacity: 0.7;
}
.tab-close:hover {
  background: var(--border);
  color: var(--text);
  opacity: 1;
}

/* Panel tabs: underline accent, sit in a toolbar with the `end` slot. */
.tabs-panel {
  flex-wrap: wrap;
  gap: var(--space-1);
}
.tabs-panel .tabs-list {
  gap: var(--space-1);
}
.tabs-panel .tab {
  padding: 9px var(--space-3);
  font-size: var(--text-sm);
  font-weight: var(--weight-bold);
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
}
.tabs-panel .tab-item.on .tab {
  border-bottom-color: var(--color-accent);
}
</style>
