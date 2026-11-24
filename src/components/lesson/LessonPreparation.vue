<script setup lang="ts">
import { t, uiLocale } from '../../lib/i18n.ts'
import { computed } from 'vue'
import Gem from '../Gem.vue'

const props = defineProps({
  loading: Boolean,
  title: { type: String, default: '' },
  providerName: { type: String, required: true },
  generation: { type: Object, default: null },
  moduleIndex: { type: Number, default: 0 },
  error: { type: String, default: '' },
})
const emit = defineEmits(['retry'])

const tips = [
  t('After the example, try it yourself with a hint and no grade.'),
  t('The next lesson prepares in the background while you work.'),
  t('Mistakes become flashcards for later review.'),
  t('Enter checks the answer or continues. Keys 1–4 select an answer.'),
]
const tip = tips[Math.floor(Math.random() * tips.length)]
const progress = computed(() => {
  const generation = props.generation
  if (generation?.stage === 'building') return t('Preparing the environment (one-time setup)…')
  if (generation?.stage === 'validating') return t('Running tests against the reference solution…')
  if (generation?.stage === 'fixing') return t('A test failed. {0} is fixing the exercise…', [props.providerName])
  const characters = (generation?.chars || 0).toLocaleString(uiLocale())
  const seconds = Math.round((generation?.elapsed || 0) / 1000)
  return t('{0} characters · {1} s', [characters, seconds])
})
</script>

<template>
  <main class="preparation">
    <div v-if="loading" class="status-card card">
      <Gem :index="moduleIndex" :size="72" glow />
      <h1>{{ providerName }} {{ t('is preparing your lesson') }}</h1>
      <p v-if="title" class="lesson-title">{{ title }}</p>
      <div class="generation" role="status">
        <span class="spinner" aria-hidden="true" />
        <div>
          <span>{{ progress }}</span>
          <code v-if="generation?.stage === 'building' && generation.stageMsg">{{ generation.stageMsg }}</code>
        </div>
      </div>
      <p class="tip">{{ tip }}</p>
    </div>
    <div v-else class="status-card card">
      <h1>{{ t('Couldn\'t prepare the lesson') }}</h1>
      <p class="error" role="alert">{{ error }}</p>
      <div class="actions">
        <RouterLink to="/path" class="btn">{{ t('Go back') }}</RouterLink>
        <button type="button" class="btn btn-primary" @click="emit('retry')">{{ t('Try again') }}</button>
      </div>
    </div>
  </main>
</template>

<style scoped>
.preparation {
  flex: 1;
  display: grid;
  place-items: center;
  padding: 24px 16px;
}
.status-card {
  width: min(100%, 36rem);
  display: grid;
  justify-items: center;
  gap: 14px;
  padding: clamp(20px, 5vw, 44px);
  text-align: center;
}
.status-card h1 {
  font-size: clamp(1.375rem, 4vw, 1.75rem);
}
.lesson-title,
.tip {
  margin: 0;
  color: var(--text-3);
  line-height: 1.55;
}
.generation {
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-deep);
  text-align: start;
}
.generation .spinner {
  flex: none;
  width: 18px;
  height: 18px;
  border-width: 2px;
}
.generation code {
  display: block;
  color: var(--muted);
  font-size: 0.8125rem;
  overflow-wrap: anywhere;
}
.error {
  margin: 0;
  color: var(--red-light);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}
</style>
