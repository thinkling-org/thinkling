<script setup lang="ts">
export type TagTone = 'neutral' | 'purple' | 'green' | 'yellow' | 'red'

withDefaults(defineProps<{ tone?: TagTone }>(), { tone: 'neutral' })
</script>

<template>
  <span :class="['tag', `tag-${tone}`]">
    <slot />
  </span>
</template>
