<script setup lang="ts">
import { useTemplateRef } from 'vue'
import Icon from '../Icon.vue'

/**
 * A flat button that shows only an icon. `label` is required: it is the accessible
 * name and the tooltip. Pass `icon` (an Icon name) or put custom content in the slot.
 */
const props = withDefaults(
  defineProps<{
    label: string
    icon?: string
    size?: 'xs' | 'sm' | 'md' | 'lg'
    variant?: 'plain' | 'outlined'
    disabled?: boolean
    type?: 'button' | 'submit' | 'reset'
    /** Icon size in px. Defaults to a size that fits the button. */
    iconSize?: number
    /** Icon stroke width. */
    stroke?: number
  }>(),
  { size: 'md', variant: 'plain', type: 'button', stroke: 2.6 },
)

const ICON_SIZES = { xs: 12, sm: 14, md: 20, lg: 24 }

const button = useTemplateRef<HTMLButtonElement>('button')
defineExpose({ focus: (options?: FocusOptions) => button.value?.focus(options) })

function iconSize() {
  return props.iconSize ?? ICON_SIZES[props.size]
}
</script>

<template>
  <button
    ref="button"
    :type="type"
    :class="['icon-btn', size !== 'md' && `icon-btn-${size}`, variant === 'outlined' && 'icon-btn-outlined']"
    :aria-label="label"
    :title="label"
    :disabled="disabled"
  >
    <slot><Icon v-if="icon" :name="icon" :size="iconSize()" :stroke="stroke" /></slot>
  </button>
</template>
