<script setup lang="ts">
// An exercise the learner does inside a block; the block grades it (API 1.1 exercise mode).
import { t } from '../../lib/i18n.ts'
import { computed, watch } from 'vue'
import type { PropType } from 'vue'
import Markdown from '../Markdown.vue'
import BlockHost from '../../blocks/BlockHost.vue'
import MissingExtension from './MissingExtension.vue'
import { interactionBlock, readInteraction } from '../../blocks/registry.ts'
import { pluginState } from '../../blocks/installed.ts'
import type { BlockProps, GradeResult } from '../../blocks/types.ts'
import type { Exercise, ExerciseResult } from '../../domain.ts'

const props = defineProps({
  exercise: { type: Object as PropType<Exercise>, required: true },
  modelValue: { default: null },
  result: { type: Object as PropType<ExerciseResult>, default: null },
})
const emit = defineEmits<{ 'update:modelValue': [answer: unknown]; unavailable: [] }>()

const isPractice = computed(() => props.exercise.stage === 'practice')
const block = computed(() => interactionBlock(props.exercise))
const data = computed(() => readInteraction(props.exercise))
const blockType = computed(() => String(props.exercise.interaction?.type ?? ''))
// Wait for plugins to load before deciding the extension is missing.
const missing = computed(() => !block.value && pluginState.ready)
const invalid = computed(() => !!block.value && !data.value)

const graded = computed<GradeResult | null>(() => {
  const status = props.result?.status
  if (!props.result || props.result.retry || !['correct', 'almost', 'wrong'].includes(status)) return null
  return { verdict: status as GradeResult['verdict'], score: (props.result.data?.score ?? 0) / 10, feedback: props.result.data?.feedback }
})
const blockProps = computed<BlockProps>(() => ({
  data: data.value,
  codeLanguage: props.exercise.codeLanguage || 'javascript',
  mode: 'exercise',
  answer: props.modelValue,
  result: graded.value,
}))

function onBlockEvent(name: string, payload: unknown) {
  if (name !== 'answer') return
  const { value, complete } = (payload ?? {}) as { value?: unknown; complete?: boolean }
  // An incomplete answer keeps the Check button disabled.
  emit('update:modelValue', complete ? value : null)
}

// Without its block the exercise cannot be done; the lesson moves on without counting it.
watch(() => missing.value || invalid.value, (unusable) => {
  if (unusable && !props.result) emit('unavailable')
}, { immediate: true })
</script>

<template>
  <div class="ex">
    <span class="kind label">{{ isPractice ? t('Ungraded practice') : t('Interactive task') }}</span>
    <Markdown tag="h1" fit-heading class="q" :src="exercise.prompt" />
    <BlockHost v-if="block && data" :block="block" :block-props="blockProps" @event="onBlockEvent" />
    <MissingExtension v-else-if="missing" :block-type="blockType" />
    <p v-else-if="invalid" class="card broken" role="note">{{ t('This exercise could not be displayed. It does not count toward your score.') }}</p>

    <div v-if="graded && (exercise.explanation || graded.feedback)" class="card explain" :class="graded.verdict">
      <span class="label">{{ isPractice ? t('How to solve this exercise') : t('Explanation') }}</span>
      <p v-if="graded.feedback && graded.verdict !== 'correct'" class="feedback">{{ graded.feedback }}</p>
      <Markdown v-if="exercise.explanation" :src="exercise.explanation" />
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
.broken {
  margin: 0;
  padding: 16px 18px;
  color: var(--text-2);
  font-weight: 700;
}
.explain {
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 16px;
  color: var(--text-2);
  animation: dl-pop 0.25s ease-out;
}
.explain.correct {
  border-color: var(--green-border);
}
.explain.correct .label {
  color: var(--green-light);
}
.explain.almost {
  border-color: var(--yellow-border);
}
.explain.almost .label {
  color: var(--yellow-light);
}
.explain.wrong {
  border-color: var(--red-border);
}
.explain.wrong .label {
  color: var(--red-light);
}
.feedback {
  margin: 0;
  font-weight: 800;
  color: var(--text);
}
</style>
