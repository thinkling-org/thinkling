<script setup>
import { computed } from 'vue'
import { renderMarkdown } from '../lib/markdown.js'

const props = defineProps({ src: { type: String, default: '' }, inline: Boolean, tag: { type: String, default: 'div' } })
const html = computed(() => renderMarkdown(props.src, { inline: props.inline }))
</script>

<template>
  <component :is="tag" class="md" v-html="html" />
</template>
