<script setup>
import { t } from '../../lib/i18n.js'
import CodeTrace from '../CodeTrace.vue'
import Icon from '../Icon.vue'

defineProps({
  exercise: { type: Object, required: true },
  chosenIndex: { type: Number, default: null },
  progress: { type: Object, default: null },
  providerName: { type: String, required: true },
})
const emit = defineEmits(['close', 'retry'])
</script>

<template>
  <section :aria-label="t('Przebieg kodu')">
    <button type="button" class="link-btn back" @click="emit('close')">
      <Icon name="arrow-left" :size="16" />
      {{ exercise.type === 'learn' ? t('Wróć do karty wiedzy') : t('Wróć do pytania') }}
    </button>
    <CodeTrace v-if="exercise.trace" :exercise="exercise" :trace="exercise.trace" :chosen-index="chosenIndex" />
    <div v-else-if="progress?.error" class="card trace-status">
      <strong class="error" role="alert">{{ t('Nie udało się przygotować prześledzenia') }}</strong>
      <span class="error-details">{{ progress.error }}</span>
      <button type="button" class="btn btn-sm btn-primary" @click="emit('retry')">{{ t('Spróbuj ponownie') }}</button>
    </div>
    <div v-else class="card trace-status" role="status">
      <span class="spinner" aria-hidden="true" />
      <span>{{ providerName }} {{ t('śledzi wykonanie kodu…') }} {{ progress?.chars || 0 }} {{ t('zn') }}</span>
    </div>
  </section>
</template>

<style scoped>
.back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
}
.trace-status {
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  font-weight: 700;
  color: var(--text-3);
}
.error {
  color: var(--red-light);
}
.error-details {
  font-family: var(--mono);
  font-size: 0.8125rem;
  width: 100%;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
