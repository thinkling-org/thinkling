<script setup lang="ts">
withDefaults(
  defineProps<{
    /** Placeholder or empty-state look. */
    dashed?: boolean
    as?: string
  }>(),
  { as: 'div' },
)
</script>

<template>
  <component :is="as" :class="dashed ? 'card-dashed' : 'card'">
    <slot />
  </component>
</template>
