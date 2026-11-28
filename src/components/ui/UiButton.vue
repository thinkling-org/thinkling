<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import UiSpinner from './UiSpinner.vue'

export type ButtonVariant =
  | 'default'
  | 'primary'
  | 'green'
  | 'yellow'
  | 'red'
  | 'ghost'
  | 'ghost-yellow'
  | 'ghost-red'
  | 'ghost-green'
  | 'link'
export type ButtonSize = 'sm' | 'md' | 'lg'

const props = withDefaults(
  defineProps<{
    variant?: ButtonVariant
    size?: ButtonSize
    block?: boolean
    /** Renders a RouterLink. */
    to?: RouteLocationRaw
    /** Renders a plain anchor. */
    href?: string
    type?: 'button' | 'submit' | 'reset'
    disabled?: boolean
    /** Shows a spinner, disables the button and marks it busy. */
    loading?: boolean
  }>(),
  { variant: 'default', size: 'md', type: 'button' },
)

const tag = computed(() => (props.to !== undefined ? RouterLink : props.href !== undefined ? 'a' : 'button'))
const classes = computed(() =>
  props.variant === 'link'
    ? ['link-btn']
    : [
        'btn',
        props.variant !== 'default' && `btn-${props.variant}`,
        props.size !== 'md' && `btn-${props.size}`,
        props.block && 'btn-block',
      ],
)
const inactive = computed(() => props.disabled || props.loading)
const attrs = computed(() => {
  if (tag.value === 'button') return { type: props.type, disabled: inactive.value }
  // Links cannot be disabled natively, so they drop their target and announce it.
  const target = inactive.value ? {} : props.to !== undefined ? { to: props.to } : { href: props.href }
  return { ...target, 'aria-disabled': inactive.value || undefined, tabindex: inactive.value ? -1 : undefined }
})
</script>

<template>
  <component :is="tag" :class="classes" v-bind="attrs" :aria-busy="loading || undefined">
    <UiSpinner v-if="loading" />
    <slot />
  </component>
</template>
