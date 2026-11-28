<script setup lang="ts" generic="M extends ChoiceValue | ChoiceValue[]">
import { computed, useTemplateRef } from 'vue'
import type { ChoiceOption, ChoiceValue } from './types.ts'

/** One option's value: the model itself, or an element of it with `multiple`. */
type Item = M extends readonly (infer E)[] ? E : M

/**
 * A row of chips to pick from.
 * Single choice (v-model is a value): a radio group. Arrow keys move and select, Tab leaves the group.
 * `multiple` (v-model is an array): toggle buttons with aria-pressed.
 * Name the group with `label` or `labelledby`.
 */
const props = defineProps<{
  options: readonly ChoiceOption<Item>[]
  multiple?: boolean
  label?: string
  labelledby?: string
  disabled?: boolean
}>()
const model = defineModel<M>({ required: true })
const emit = defineEmits<{ select: [value: Item] }>()

const chips = useTemplateRef<HTMLButtonElement[]>('chips')

function isSelected(value: Item) {
  const current: unknown = model.value
  return Array.isArray(current) ? current.includes(value) : current === value
}
function isDisabled(option: ChoiceOption<Item>) {
  return props.disabled || !!option.disabled
}

// The one radio that is reachable with Tab: the selected one, else the first enabled one.
const tabStop = computed(() => {
  const selected = props.options.findIndex((option) => isSelected(option.value) && !isDisabled(option))
  return selected >= 0 ? selected : props.options.findIndex((option) => !isDisabled(option))
})

function choose(option: ChoiceOption<Item>) {
  if (isDisabled(option)) return
  const current: unknown = model.value
  if (props.multiple) {
    const list: unknown[] = Array.isArray(current) ? current : []
    model.value = (list.includes(option.value) ? list.filter((v) => v !== option.value) : [...list, option.value]) as M
  } else {
    model.value = option.value as M
  }
  emit('select', option.value)
}

function move(from: number, step: number) {
  const count = props.options.length
  for (let i = 1; i <= count; i++) {
    const index = (from + step * i + count) % count
    const option = props.options[index]
    if (isDisabled(option)) continue
    choose(option)
    chips.value?.[index]?.focus()
    return
  }
}

function onKeydown(event: KeyboardEvent, index: number) {
  if (props.multiple) return
  const rtl = getComputedStyle(event.currentTarget as Element).direction === 'rtl'
  const keys: Record<string, number> = {
    ArrowRight: rtl ? -1 : 1, ArrowDown: 1,
    ArrowLeft: rtl ? 1 : -1, ArrowUp: -1,
  }
  if (event.key in keys) {
    event.preventDefault()
    move(index, keys[event.key])
  } else if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault()
    move(event.key === 'Home' ? -1 : props.options.length, event.key === 'Home' ? 1 : -1)
  }
}
</script>

<template>
  <div
    class="choice-group"
    :role="multiple ? 'group' : 'radiogroup'"
    :aria-label="label || undefined"
    :aria-labelledby="labelledby || undefined"
  >
    <button
      v-for="(option, index) in options"
      ref="chips"
      :key="String(option.value)"
      type="button"
      :class="['chip', option.class]"
      :role="multiple ? undefined : 'radio'"
      :aria-checked="multiple ? undefined : isSelected(option.value)"
      :aria-pressed="multiple ? isSelected(option.value) : undefined"
      :tabindex="multiple ? undefined : index === tabStop ? 0 : -1"
      :disabled="isDisabled(option)"
      :title="option.title"
      @click="choose(option)"
      @keydown="onKeydown($event, index)"
    >{{ option.label }}</button>
  </div>
</template>

<style scoped>
.choice-group {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
</style>
