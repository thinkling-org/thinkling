<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { highlightLines, normalizeLang } from '../lib/markdown.ts'
import { activeTerm, closeCodeDefinitionSoon, keepCodeDefinitionOpen, linkCodeTerms } from '../lib/glossary.ts'
import { markCodeTokens } from '../lib/code-tokens.ts'

const props = defineProps({
  code: { type: String, default: '' },
  language: { type: String, default: 'javascript' },
  fileName: { type: String, default: '' },
  lineNumbers: { type: Boolean, default: true },
  activeLine: { type: Number, default: null },
  // Lesson-specific definitions override the built-in glossary for these snippets.
  tokens: { type: Array, default: () => [] },
  activeToken: { type: Number, default: -1 },
})
const emit = defineEmits(['token'])
const listing = ref(null)
const lines = computed(() => {
  const language = normalizeLang(props.language)
  return highlightLines(props.code, language).map((line) => props.tokens.length
    ? markCodeTokens(line, props.tokens, props.activeToken)
    : linkCodeTerms(line, language))
})
const ext = computed(() => ({ javascript: 'js', typescript: 'ts', python: 'py', go: 'go', rust: 'rs', java: 'java', csharp: 'cs' })[props.language] || 'txt')

function showDefinition(event) {
  if (event.type === 'pointerover' && event.pointerType === 'touch') return
  const token = event.target.closest('.def-term')
  if (token) return emit('token', Number(token.dataset.token))
  const term = event.target.closest('.code-term')
  if (!term) return
  keepCodeDefinitionOpen()
  activeTerm.value = term
}

function leaveDefinition(event) {
  const term = event.target.closest('.code-term')
  if (term && activeTerm.value === term && !term.contains(event.relatedTarget)) closeCodeDefinitionSoon(term)
}

function closeDefinition() {
  if (activeTerm.value && listing.value?.contains(activeTerm.value)) activeTerm.value = null
}

watch(lines, closeDefinition)
onBeforeUnmount(closeDefinition)
</script>

<template>
  <div class="cb">
    <div class="chrome">
      <span class="d" /><span class="d" /><span class="d" />
      <span class="fn">{{ fileName || `snippet.${ext}` }}</span>
    </div>
    <pre ref="listing" class="hljs" @pointerover="showDefinition" @pointerout="leaveDefinition" @focusin="showDefinition" @focusout="leaveDefinition" @click="showDefinition"><code><div v-for="(l, i) in lines" :key="i" class="ln" :class="{ active: i + 1 === activeLine }"><span v-if="lineNumbers" class="no">{{ i + 1 }}</span><span v-html="l || ' '" /></div></code></pre>
  </div>
</template>

<style scoped>
.cb {
  background: var(--bg-deep);
  border: 2px solid var(--border);
  border-bottom-width: 5px;
  border-radius: 18px;
  overflow: hidden;
}
.chrome {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 2px solid var(--divider);
}
.d {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: var(--border);
}
.fn {
  margin-left: 8px;
  font-family: var(--mono);
  font-size: 13px;
  color: var(--muted);
}
pre {
  margin: 0;
  padding: 16px 20px;
  font-size: 16px;
  line-height: 1.75;
  overflow-x: auto;
}
.ln {
  display: flex;
  white-space: pre;
}
.ln.active {
  background: var(--purple-soft);
  box-shadow: -3px 0 var(--purple-link);
}
.ln.active .no {
  color: var(--purple-light);
}
.no {
  width: 2.2em;
  flex: none;
  color: var(--faint);
  user-select: none;
}
:deep(.code-term) {
  border: 0;
  padding: 0;
  background: none;
  color: inherit;
  font: inherit;
  cursor: help;
  user-select: text;
  text-decoration: underline dotted color-mix(in srgb, currentColor 45%, transparent);
  text-underline-offset: 3px;
}
:deep(.def-term) {
  border: 0;
  border-bottom: 2px dashed var(--purple-link);
  border-radius: 4px 4px 0 0;
  padding: 0 2px;
  background: none;
  color: inherit;
  font: inherit;
  cursor: help;
}
:deep(.def-term:hover),
:deep(.def-term.active) {
  background: var(--purple-soft);
}
:deep(.def-term.active) {
  border-bottom-style: solid;
}
:deep(.code-term:hover),
:deep(.code-term[aria-expanded='true']) {
  background: var(--purple-soft);
}
</style>
