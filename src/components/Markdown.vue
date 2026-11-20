<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { renderMarkdown } from '../lib/markdown.js'
import SpeechPlayer from './SpeechPlayer.vue'
import { readableSpeechText } from '../lib/speech-text.js'
import { activeTerm, linkGlossaryTerms } from '../lib/glossary.js'
import { useApp } from '../stores/app.js'

defineOptions({ inheritAttrs: false })

const props = defineProps({
  src: { type: String, default: '' },
  inline: Boolean,
  tag: { type: String, default: 'div' },
  readAloud: Boolean,
  fitHeading: Boolean,
  glossary: Boolean,
})
const app = useApp()
const content = ref(null)
const html = computed(() => {
  const rendered = renderMarkdown(props.src, { inline: props.inline })
  return !props.inline || props.glossary ? linkGlossaryTerms(rendered) : rendered
})
const textLength = computed(() => {
  const template = document.createElement('template')
  template.innerHTML = html.value
  return readableSpeechText(template.content).length
})
const canRead = computed(() => props.readAloud && app.status?.features?.speech !== false && textLength.value >= 100)
const headingStyle = computed(() => {
  if (!props.fitHeading) return undefined
  const length = textLength.value
  if (length >= 160) return { fontSize: 'clamp(1.125rem, 2.6vw, 1.4375rem)' }
  if (length >= 100) return { fontSize: 'clamp(1.25rem, 2.9vw, 1.625rem)' }
  if (length >= 70) return { fontSize: 'clamp(1.375rem, 3.1vw, 1.8125rem)' }
  return undefined
})
const getText = () => [readableSpeechText(content.value)]

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
  <div v-if="canRead || $slots.leading" v-bind="$attrs" class="readable-markdown" :class="{ 'has-leading': $slots.leading }" :style="headingStyle">
    <SpeechPlayer v-if="canRead" :key="html" :get-text="getText" class="markdown-reader" />
    <slot name="leading" />
    <component :is="tag" ref="content" class="md" :class="{ 'fitted-heading': fitHeading }" v-html="html" @click="openDefinition" @keydown="guardTermShortcut" />
  </div>
  <component :is="tag" v-else ref="content" v-bind="$attrs" class="md" :class="{ 'fitted-heading': fitHeading }" :style="headingStyle" v-html="html" @click="openDefinition" @keydown="guardTermShortcut" />
</template>

<style scoped>
.readable-markdown {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  min-width: 0;
}
.readable-markdown.has-leading {
  grid-template-columns: auto minmax(0, 1fr);
  column-gap: 12px;
  align-items: start;
}
.has-leading > .markdown-reader,
.has-leading > .md {
  grid-column: 2;
}
.readable-markdown > :is(h1, h2, h3, h4, h5, h6) {
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
