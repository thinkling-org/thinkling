<script setup lang="ts">
import { t } from '../../lib/i18n.ts'
import { ref, onMounted } from 'vue'
import Markdown from '../Markdown.vue'
import CodeBlock from '../CodeBlock.vue'
import Icon from '../Icon.vue'
import { useLessonSupport } from '../../composables/useLessonSupport.ts'
import { UiButton, UiSpinner, UiTag } from '../ui/index.ts'

defineProps({
  exercise: { type: Object, required: true },
  modelValue: { type: String, default: '' },
  result: { type: Object, default: null },
  providerName: { type: String, required: true },
  busy: Boolean,
})
const emit = defineEmits(['update:modelValue', 'submit'])
const support = useLessonSupport()
const showModel = ref(false)
const ta = ref(null)
onMounted(() => ta.value?.focus())

const POINT = {
  good: { icon: 'check', color: 'var(--green)' },
  bad: { icon: 'x', color: 'var(--red)' },
  tip: { icon: 'bulb', color: 'var(--yellow)' },
}
</script>

<template>
  <div class="ex">
    <span class="kind label">{{ exercise.stage === 'practice' ? t('Guided practice · no grade') : t('Open question') }}</span>
    <Markdown tag="h1" fit-heading class="q" :src="exercise.prompt" />
    <CodeBlock v-if="exercise.code" :code="exercise.code" :language="exercise.codeLanguage" />

    <div class="group">
      <label :for="`a-${exercise.id}`" class="label">{{ t('Your answer') }}</label>
      <textarea
        :id="`a-${exercise.id}`"
        ref="ta"
        class="field"
        rows="6"
        :value="modelValue"
        :readonly="!!result || busy"
        :placeholder="exercise.stage === 'practice' ? t('Try a short answer in your own words. You can use a hint.') : t('Answer in your own words, as in an interview. Press Ctrl+Enter to submit.')"
        @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
        @keydown.ctrl.enter.prevent="emit('submit')"
      />
    </div>

    <div v-if="busy" class="card grading">
      <UiSpinner />
      <span>{{ providerName }} {{ t('is reading your answer…') }}</span>
    </div>

    <div v-if="result?.status === 'unknown' || result?.solutionRevealed" class="card feedback">
      <span class="label" style="color: var(--purple-link)">{{ t('Reference answer') }}</span>
      <Markdown :src="exercise.referenceAnswer" class="ptxt" />
      <template v-if="exercise.keyPoints?.length">
        <span class="label">{{ t('Key points') }}</span>
        <Markdown v-for="(k, i) in exercise.keyPoints" :key="i" inline tag="span" :src="k" class="ptxt">
          <template #leading>
            <span class="pi" style="color: var(--yellow)"><Icon name="bulb" :size="18" :stroke="2.6" /></span>
          </template>
        </Markdown>
      </template>
    </div>

    <div v-if="result?.data" class="card feedback">
      <UiTag v-if="exercise.stage !== 'practice'" class="grade" :tone="result.status === 'correct' ? 'green' : result.status === 'almost' ? 'yellow' : 'red'">
        {{ result.data.score }} / 10
      </UiTag>
      <Markdown v-for="(p, i) in result.data.points" :key="i" :src="p.text" class="ptxt">
        <template #leading>
          <span class="pi" :style="{ color: POINT[p.kind]?.color }"><Icon :name="POINT[p.kind]?.icon || 'bulb'" :size="18" :stroke="3" /></span>
        </template>
      </Markdown>
      <UiButton variant="link" :aria-expanded="showModel" @click="showModel = !showModel; showModel && support?.mark(exercise.id, 'solution')">{{ showModel ? t('Hide') : t('Show') }} {{ t('reference answer') }}</UiButton>
      <Markdown v-if="showModel" class="model" :src="result.data.modelAnswer || exercise.referenceAnswer" />
    </div>
  </div>
</template>

<style scoped>
.ex {
  display: flex;
  flex-direction: column;
  gap: 22px;
}
.kind {
  color: var(--purple-link);
}
.q {
  font-size: clamp(24px, 3.2vw, 32px);
  line-height: 1.25;
  font-weight: 900;
}
.q :deep(code) {
  font-size: 0.85em;
}
.group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.grading {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  font-weight: 700;
  color: var(--text-3);
}
.feedback {
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  animation: dl-pop 0.25s ease-out;
}
.grade {
  align-self: flex-start;
  font-size: 15px;
  font-weight: 900;
}
.pi {
  display: flex;
  align-items: center;
  min-height: 1.6em;
}
.ptxt {
  font-size: 16px;
  color: var(--text-2);
}
.link-btn {
  align-self: flex-start;
}
.model {
  background: var(--bg-deep);
  border-radius: 14px;
  padding: 14px 16px;
  color: var(--text-2);
}
</style>
