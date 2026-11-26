<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { renderMarkdown } from '../lib/markdown.ts'
import { activeTerm, linkGlossaryTerms } from '../lib/glossary.ts'

defineOptions({ inheritAttrs: false })

const props = defineProps({
  src: { type: String, default: '' },
  inline: Boolean,
  tag: { type: String, default: 'div' },
  fitHeading: Boolean,
  glossary: Boolean,
})
const content = ref(null)
const html = computed(() => {
  const rendered = renderMarkdown(props.src, { inline: props.inline })
  return !props.inline || props.glossary ? linkGlossaryTerms(rendered) : rendered
})
const textLength = computed(() => {
  const template = document.createElement('template')
  template.innerHTML = html.value
  return template.content.textContent.replace(/\s+/g, ' ').trim().length
})
const headingStyle = computed(() => {
  if (!props.fitHeading) return undefined
  const length = textLength.value
  if (length >= 160) return { fontSize: 'clamp(1.125rem, 2.6vw, 1.4375rem)' }
  if (length >= 100) return { fontSize: 'clamp(1.25rem, 2.9vw, 1.625rem)' }
  if (length >= 70) return { fontSize: 'clamp(1.375rem, 3.1vw, 1.8125rem)' }
  return undefined
})

function openDefinition(event) {
  const term = event.target.closest('button[data-glossary-term]')
  if (!term) return
  event.stopPropagation()
  activeTerm.value = activeTerm.value === term ? null : term
}

function closeLocalDefinition() {
  if (activeTerm.value && content.value?.contains(activeTerm.value)) activeTerm.value = null
}

function guardTermShortcut(event) {
  if (event.target.matches?.('button[data-glossary-term]') && (event.key === 'Enter' || event.key === ' ')) {
    event.stopPropagation()
  }
}

watch(html, closeLocalDefinition)
onBeforeUnmount(closeLocalDefinition)
</script>

<template>
  <div v-if="$slots.leading" v-bind="$attrs" class="markdown-with-leading" :style="headingStyle">
    <slot name="leading" />
    <component :is="tag" ref="content" class="md" :class="{ 'fitted-heading': fitHeading }" v-html="html" @click="openDefinition" @keydown="guardTermShortcut" />
  </div>
  <component :is="tag" v-else ref="content" v-bind="$attrs" class="md" :class="{ 'fitted-heading': fitHeading }" :style="headingStyle" v-html="html" @click="openDefinition" @keydown="guardTermShortcut" />
</template>

<style scoped>
.markdown-with-leading {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 8px 12px;
  align-items: start;
  min-width: 0;
}
.markdown-with-leading > .md {
  grid-column: 2;
}
.markdown-with-leading > :is(h1, h2, h3, h4, h5, h6) {
  font-size: inherit;
  line-height: inherit;
}
.fitted-heading {
  text-wrap: pretty;
}
.md :deep(.glossary-term) {
  display: inline;
  padding: 0;
  border: 0;
  border-radius: 2px;
  background: transparent;
  font: inherit;
  letter-spacing: inherit;
  color: inherit;
  text-decoration: underline dotted var(--purple-link);
  text-underline-offset: 0.19em;
  cursor: help;
}
.md :deep(.glossary-term:hover),
.md :deep(.glossary-term[aria-expanded="true"]) {
  color: var(--purple-light);
}
</style>
