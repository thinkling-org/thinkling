<script setup>
import { t, uiLocale } from '../../lib/i18n.js'
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
  t('Po przykładzie możesz spróbować samodzielnie, z podpowiedzią i bez oceny.'),
  t('Następna lekcja przygotowuje się w tle, gdy robisz tę.'),
  t('Błędy trafiają do fiszek i wrócą w powtórce.'),
  t('Enter sprawdza odpowiedź lub przechodzi dalej. Klawisze 1–4 wybierają odpowiedź.'),
]
const tip = tips[Math.floor(Math.random() * tips.length)]
const progress = computed(() => {
  const generation = props.generation
  if (generation?.stage === 'building') return t('Przygotowuję środowisko (jednorazowo)…')
  if (generation?.stage === 'validating') return t('Sprawdzam testy na wzorcowym rozwiązaniu…')
  if (generation?.stage === 'fixing') return t('Test nie przeszedł. {0} poprawia zadanie…', [props.providerName])
  const characters = (generation?.chars || 0).toLocaleString(uiLocale())
  const seconds = Math.round((generation?.elapsed || 0) / 1000)
  return t('{0} znaków · {1} s', [characters, seconds])
})
</script>

<template>
  <main class="preparation">
    <div v-if="loading" class="status-card card">
      <Gem :index="moduleIndex" :size="72" glow />
      <h1>{{ providerName }} {{ t('przygotowuje lekcję') }}</h1>
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
      <h1>{{ t('Nie udało się przygotować lekcji') }}</h1>
      <p class="error" role="alert">{{ error }}</p>
      <div class="actions">
        <RouterLink to="/path" class="btn">{{ t('Wróć') }}</RouterLink>
        <button type="button" class="btn btn-primary" @click="emit('retry')">{{ t('Spróbuj ponownie') }}</button>
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
