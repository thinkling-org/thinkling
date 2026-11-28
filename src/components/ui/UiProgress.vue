<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    value: number
    max?: number
    label?: string
  }>(),
  { max: 1 },
)
const percent = computed(() => {
  if (!(props.max > 0)) return 0
  return Math.min(100, Math.max(0, (props.value / props.max) * 100))
})
</script>

<template>
  <div
    class="bar"
    role="progressbar"
    :aria-valuemin="0"
    :aria-valuemax="max"
    :aria-valuenow="value"
    :aria-label="label || undefined"
  >
    <div :style="{ width: `${percent}%` }" />
  </div>
</template>
