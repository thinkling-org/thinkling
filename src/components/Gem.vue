<script setup>
import { computed } from 'vue'
import { GEMS } from '../stores/app.js'

const props = defineProps({
  index: { type: Number, default: 0 },
  size: { type: [Number, String], default: 44 },
  glow: { type: Boolean, default: false },
  muted: { type: Boolean, default: false },
  colors: { type: Array, default: null },
})
const c = computed(() => (props.muted ? ['#2C3237', '#3A4147'] : props.colors || GEMS[props.index % GEMS.length]))
</script>

<template>
  <svg
    aria-hidden="true"
    :width="size"
    :height="size"
    viewBox="0 0 48 48"
    :style="glow ? { filter: `drop-shadow(0 0 18px ${c[0]}aa)` } : null"
  >
    <polygon points="24,3 42,13.5 42,34.5 24,45 6,34.5 6,13.5" :fill="c[0]" />
    <polygon points="24,12 33,17 33,31 24,36 15,31 15,17" :fill="c[1]" />
    <polygon points="24,3 42,13.5 33,17 24,12" fill="#fff" opacity=".18" />
  </svg>
</template>
