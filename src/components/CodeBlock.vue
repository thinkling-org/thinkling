<script setup>
import { computed } from 'vue'
import { highlightLines } from '../lib/markdown.js'

const props = defineProps({
  code: { type: String, default: '' },
  language: { type: String, default: 'javascript' },
  fileName: { type: String, default: '' },
  lineNumbers: { type: Boolean, default: true },
})
const lines = computed(() => highlightLines(props.code, props.language))
const ext = computed(() => ({ javascript: 'js', typescript: 'ts', python: 'py', go: 'go', rust: 'rs', java: 'java', csharp: 'cs' })[props.language] || 'txt')
</script>

<template>
  <div class="cb">
    <div class="chrome">
      <span class="d" /><span class="d" /><span class="d" />
      <span class="fn">{{ fileName || `snippet.${ext}` }}</span>
    </div>
    <pre class="hljs"><code><div v-for="(l, i) in lines" :key="i" class="ln"><span v-if="lineNumbers" class="no">{{ i + 1 }}</span><span v-html="l || ' '" /></div></code></pre>
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
.no {
  width: 2.2em;
  flex: none;
  color: var(--faint);
  user-select: none;
}
</style>
