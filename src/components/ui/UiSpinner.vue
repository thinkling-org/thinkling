<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: 'sm' | 'md'
    /** Announced to screen readers. Without it the spinner is decorative. */
    label?: string
  }>(),
  { size: 'md' },
)
</script>

<template>
  <span
    :class="['spinner', size === 'sm' && 'spinner-sm']"
    :role="label ? 'status' : undefined"
    :aria-label="label || undefined"
    :aria-hidden="label ? undefined : 'true'"
  />
</template>
