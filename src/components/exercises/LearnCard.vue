<script setup>
import Markdown from '../Markdown.vue'
import CodeBlock from '../CodeBlock.vue'
import Icon from '../Icon.vue'

defineProps({ exercise: { type: Object, required: true } })
</script>

<template>
  <div class="learn">
    <span class="kind label"><Icon name="bulb" :size="16" :stroke="2.6" />Karta wiedzy</span>
    <Markdown tag="h1" class="title" :src="exercise.title || 'Nowe pojęcie'" inline />
    <Markdown class="body" :src="exercise.prompt" />
    <CodeBlock v-if="exercise.code" :code="exercise.code" :language="exercise.codeLanguage || 'javascript'" file-name="przykład" />
    <div v-if="exercise.explanation || exercise.keyPoints?.length" class="cards">
      <div v-if="exercise.explanation" class="card trap">
        <span class="label">Pułapka</span>
        <Markdown :src="exercise.explanation.replace(/^\s*\**pułapka\**\s*:\s*/i, '')" />
      </div>
      <div v-if="exercise.keyPoints?.length" class="card keep">
        <span class="label">Zapamiętaj</span>
        <ul>
          <li v-for="(k, i) in exercise.keyPoints" :key="i"><Markdown inline tag="span" :src="k" /></li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.learn {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.kind {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--yellow);
}
.title {
  font-size: clamp(26px, 3.4vw, 34px);
  line-height: 1.2;
  font-weight: 900;
}
.body {
  font-size: 18px;
  line-height: 1.65;
  color: var(--text-2);
}
.cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.cards > :only-child {
  grid-column: 1 / -1;
}
.trap,
.keep {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 15px;
  color: var(--text-2);
}
.trap {
  border-color: var(--yellow-border);
}
.trap .label {
  color: var(--yellow-light);
}
.keep {
  border-color: var(--green-border);
}
.keep .label {
  color: var(--green-light);
}
.keep ul {
  margin: 0;
  padding-left: 1.1em;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-weight: 700;
}
@media (max-width: 640px) {
  .cards {
    grid-template-columns: 1fr;
  }
}
</style>
