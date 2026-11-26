<script setup lang="ts">
import { t } from '../../lib/i18n.ts'
import Gem from '../Gem.vue'
import type { PropType } from 'vue'
import type { LessonMastery } from '../../domain.ts'

defineProps({
  title: { type: String, required: true },
  moduleIndex: { type: Number, default: 0 },
  xp: { type: Number, required: true },
  accuracy: { type: Number, required: true },
  elapsed: { type: String, required: true },
  mastery: { type: Object as PropType<LessonMastery>, default: null },
})
</script>

<template>
  <main class="summary">
    <div class="summary-card card">
      <Gem :index="moduleIndex" :size="96" glow />
      <div>
        <h1>{{ t('Lesson complete!') }}</h1>
        <p class="lesson-title">{{ title }}</p>
      </div>
      <dl class="results">
        <div class="points">
          <dt>{{ t('Total XP') }}</dt>
          <dd>{{ xp }}</dd>
        </div>
        <div class="accuracy">
          <dt>{{ t('Accuracy') }}</dt>
          <dd>{{ accuracy }}%</dd>
        </div>
        <div class="time">
          <dt>{{ t('Time') }}</dt>
          <dd>{{ elapsed }}</dd>
        </div>
      </dl>
      <p v-if="mastery" class="mastery">
        {{ t('Solved on your own: {0} / {1}', [mastery.independent, mastery.total]) }}<br />
        {{ t('Solved with support: {0}', [mastery.assisted]) }}
      </p>
    </div>
  </main>
</template>

<style scoped>
.summary {
  flex: 1;
  display: grid;
  place-items: center;
  padding: 24px 16px;
}
.summary-card {
  width: min(100%, 42rem);
  display: grid;
  justify-items: center;
  gap: clamp(16px, 4vw, 28px);
  padding: clamp(20px, 5vw, 44px);
  text-align: center;
}
.summary-card h1 {
  font-size: clamp(1.75rem, 5vw, 2.5rem);
}
.lesson-title {
  margin: 6px 0 0;
  color: var(--text-3);
  overflow-wrap: anywhere;
}
.results {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 7rem), 1fr));
  gap: 8px;
  width: 100%;
  margin: 0;
}
.results > div {
  display: flex;
  flex-direction: column-reverse;
  gap: 4px;
  padding: 12px 8px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-deep);
}
.results dt {
  font-size: 0.875rem;
  color: var(--text-3);
}
.results dd {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
}
.points dd { color: var(--yellow); }
.accuracy dd { color: var(--green-light); }
.time dd { color: var(--blue-light); }
.mastery { margin: 0; color: var(--text-3); line-height: 1.6; }
</style>
