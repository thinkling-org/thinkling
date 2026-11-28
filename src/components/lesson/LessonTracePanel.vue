<script setup lang="ts">
import { t } from '../../lib/i18n.ts'
import CodeTrace from '../CodeTrace.vue'
import Icon from '../Icon.vue'
import type { PropType } from 'vue'
import type { Exercise } from '../../domain.ts'
import { UiButton, UiSpinner } from '../ui/index.ts'

defineProps({
  exercise: { type: Object as PropType<Exercise>, required: true },
  chosenIndex: { type: Number, default: null },
  progress: { type: Object, default: null },
  providerName: { type: String, required: true },
})
const emit = defineEmits(['close', 'retry'])
</script>

<template>
  <section :aria-label="t('Code trace')">
    <UiButton variant="link" class="back" @click="emit('close')">
      <Icon name="arrow-left" :size="16" />
      {{ exercise.type === 'learn' ? t('Back to the knowledge card') : t('Back to the question') }}
    </UiButton>
    <CodeTrace v-if="exercise.trace" :exercise="exercise" :trace="exercise.trace" :chosen-index="chosenIndex" />
    <div v-else-if="progress?.error" class="card trace-status">
      <strong class="error" role="alert">{{ t('Couldn\'t prepare the code trace') }}</strong>
      <span class="error-details">{{ progress.error }}</span>
      <UiButton variant="primary" size="sm" @click="emit('retry')">{{ t('Try again') }}</UiButton>
    </div>
    <div v-else class="card trace-status" role="status">
      <UiSpinner />
      <span>{{ providerName }} {{ t('is tracing the code…') }} {{ progress?.chars || 0 }} {{ t('chars') }}</span>
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
