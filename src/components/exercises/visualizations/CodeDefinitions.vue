<script setup>
import { computed, ref, watch } from 'vue'
import Markdown from '../../Markdown.vue'
import CodeBlock from '../../CodeBlock.vue'

const props = defineProps({
  config: { type: Object, required: true },
  codeLanguage: { type: String, default: 'javascript' },
})
const selected = ref(0)
const tokens = computed(() => props.config.terms.map((term) => term.token))
const term = computed(() => props.config.terms[selected.value])
watch(() => props.config, () => { selected.value = 0 })
</script>

<template>
  <section class="card viz definitions" aria-label="Definicje w miejscu użycia">
    <Markdown v-if="config.instruction" class="instruction" :src="config.instruction" />
    <CodeBlock
      :code="config.code"
      :language="codeLanguage"
      file-name="przykład"
      :tokens="tokens"
      :active-token="selected"
      @token="selected = $event"
    />
    <div class="chips" role="group" aria-label="Fragmenty z definicją">
      <button
        v-for="(t, i) in config.terms"
        :key="t.token"
        type="button"
        class="chip"
        :class="{ on: i === selected }"
        :aria-pressed="i === selected"
        @click="selected = i"
      >{{ t.token }}</button>
    </div>
    <div :key="selected" class="definition" aria-live="polite">
      <div class="head">
        <strong class="term-title">{{ term.title }}</strong>
        <span v-if="term.kind" class="kind">{{ term.kind }}</span>
      </div>
      <Markdown class="body" :src="term.definition" />
      <pre v-if="term.example" class="example"><code>{{ term.example }}</code></pre>
    </div>
  </section>
</template>

<style scoped>
.definitions {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
  padding: clamp(12px, 3vw, 20px);
}
.instruction {
  color: var(--text-2);
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip {
  min-height: 36px;
  padding: 4px 12px;
  border: 2px solid var(--border);
  border-radius: 10px;
  background: var(--surface-2);
  color: var(--text-2);
  font-family: var(--mono);
  font-size: 14px;
  cursor: pointer;
}
.chip.on {
  border-color: var(--purple);
  background: var(--purple-soft);
  color: var(--purple-light);
}
.definition {
  display: grid;
  gap: 8px;
  padding: 14px 16px;
  border: 2px solid var(--purple);
  border-bottom-width: 5px;
  border-radius: 16px;
  background: var(--surface-2);
  animation: pop 0.2s ease-out;
}
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.term-title {
  font-family: var(--mono);
  font-size: 18px;
  color: var(--code-ink);
}
.kind {
  padding: 3px 8px;
  border-radius: 8px;
  background: var(--divider);
  color: var(--muted);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.body {
  color: var(--text-2);
}
.example {
  margin: 0;
  padding: 10px 14px;
  border-radius: 12px;
  background: var(--bg-deep);
  color: var(--text-2);
  font-size: 14px;
  overflow-x: auto;
}
@keyframes pop {
  from { transform: translateY(4px); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .definition { animation: none; }
}
</style>
