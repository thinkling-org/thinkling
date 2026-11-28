<script setup lang="ts">
/**
 * Single-line input, or a large textarea with `multiline`.
 * Other attributes (placeholder, aria-*, id…) fall through to the control.
 */
const model = defineModel<string>({ default: '' })
defineProps<{
  multiline?: boolean
  rows?: number | string
  type?: string
}>()
</script>

<template>
  <textarea v-if="multiline" v-model="model" class="field" :rows="rows" />
  <input v-else v-model="model" class="input" :type="type || 'text'" />
</template>
