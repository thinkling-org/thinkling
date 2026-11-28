<script setup lang="ts">
/**
 * Pill-shaped button. With `pressed` it is a toggle (aria-pressed): bind
 * v-model:pressed for an on/off switch, or set :pressed and handle @click for
 * single-choice groups. Without `pressed` it is a plain action (e.g. a suggestion).
 */
const props = withDefaults(defineProps<{ pressed?: boolean; disabled?: boolean }>(), { pressed: undefined })
const emit = defineEmits<{ 'update:pressed': [value: boolean] }>()

function toggle() {
  if (props.pressed !== undefined) emit('update:pressed', !props.pressed)
}
</script>

<template>
  <button type="button" class="chip" :aria-pressed="pressed" :disabled="disabled" @click="toggle">
    <slot />
  </button>
</template>
