<script setup lang="ts">
import { t } from '../../lib/i18n.ts'
import { computed } from 'vue'
import { firstSentence } from '../../lib/markdown.ts'
import Icon from '../Icon.vue'
import LessonFooter from '../LessonFooter.vue'
import Markdown from '../Markdown.vue'
import ExerciseMoreActions from './ExerciseMoreActions.vue'
import { UiButton, type ButtonVariant } from '../ui/index.ts'

const props = defineProps({
  exercise: { type: Object, required: true },
  result: { type: Object, default: null },
  providerName: { type: String, required: true },
  busy: Boolean,
  canCheck: Boolean,
  tracing: Boolean,
  nextStep: Boolean,
  canSkipLearn: { type: Boolean, default: true },
})
const emit = defineEmits(['back', 'ask', 'check', 'dont-know', 'know-it', 'next', 'retry', 'skip', 'trace', 'solution'])

const TITLES = { correct: t('Great work!'), almost: t('Almost!'), wrong: t('Not quite') }
const BUTTON_COLORS: Partial<Record<string, ButtonVariant>> = { correct: 'green', almost: 'yellow', wrong: 'red' }
const isChoice = computed(() => props.exercise.type === 'choice')
const isCode = computed(() => props.exercise.type === 'code')
const isError = computed(() => props.result?.status === 'error')
const isPractice = computed(() => props.exercise.stage === 'practice')
const isChallenge = computed(() => props.exercise.stage === 'challenge')

const feedback = computed(() => {
  const { exercise, result } = props
  if (!result || result.retry) return { tone: 'idle' }
  const { status, error, data } = result
  if (isError.value) return { tone: 'wrong', title: t('Something went wrong'), message: error }
  if (result.unavailable) return { tone: 'skipped', title: t('Skipped'), message: t('This exercise needs an extension that is not available. It does not count toward your score.') }
  if (isPractice.value) {
    if (result.solutionRevealed) return { tone: 'skipped', title: t('Solution shown'), message: t('This is practice. Help does not lower your score.') }
    return {
      tone: status === 'correct' ? 'correct' : 'almost',
      title: status === 'correct' ? t('This part works') : t('Try this part again'),
      message: status === 'correct' ? '' : firstSentence(data?.summary || data?.headline || exercise.explanation),
    }
  }
  if (status === 'skipped') return { tone: 'skipped', title: t('Skipped') }
  if (status === 'unknown') {
    return { tone: 'skipped', title: t('Keep going'), message: t('Read the reference answer. I added it to your flashcards.') }
  }
  if (isChoice.value && exercise.warmup) {
    return status === 'correct'
      ? { tone: 'correct', title: t('Good intuition!'), message: t('Let\'s see why.') }
      : { tone: 'almost', title: t('Good try!'), message: t('This was a warm-up. The explanation is next.') }
  }
  if (isChoice.value) {
    return {
      tone: status,
      title: status === 'correct' ? TITLES.correct : t('Incorrect'),
      message: exercise.trace?.headline || firstSentence(exercise.explanation),
    }
  }
  if (exercise.type === 'interactive') {
    return {
      tone: status,
      title: status === 'wrong' ? t('Incorrect') : TITLES[status],
      message: status === 'correct' ? firstSentence(exercise.explanation) : data?.feedback || firstSentence(exercise.explanation),
    }
  }
  return { tone: status, title: TITLES[status], message: data?.headline }
})

const color = computed(() => BUTTON_COLORS[feedback.value.tone])
const traceLabel = computed(() => {
  if (!isChoice.value || props.tracing || isError.value) return ''
  if (feedback.value.tone === 'wrong') return t('Explain step by step')
  if (feedback.value.tone === 'correct' && props.exercise.code && !props.exercise.warmup) return t('Trace the code')
  return ''
})
const retryLabel = computed(() => {
  if (isError.value) return t('Try again')
  if (isCode.value && ['almost', 'wrong'].includes(feedback.value.tone)) return t('I\'ll revise my code')
  return ''
})
const canAsk = computed(() => !isError.value && (feedback.value.tone !== 'wrong' || !isChoice.value || props.tracing))
const secondaryActions = computed(() => {
  if (!props.result || feedback.value.tone === 'idle' || isError.value) return []
  if (isPractice.value) return [
    ...(!props.result.solutionRevealed ? [{ id: 'retry', label: t('Try again') }] : []),
    { id: 'ask', label: t('Ask a follow-up') },
    ...(!props.result.solutionRevealed ? [{ id: 'solution', label: t('Show solution') }] : []),
  ]
  return [
    ...(traceLabel.value ? [{ id: 'trace', label: traceLabel.value }] : []),
    ...(retryLabel.value ? [{ id: 'retry', label: retryLabel.value }] : []),
    ...(canAsk.value ? [{ id: 'ask', label: `${t('Ask a follow-up')} ${props.providerName}` }] : []),
  ]
})
function runSecondaryAction(id: string) {
  if (id === 'retry' || id === 'ask' || id === 'solution' || id === 'trace') emit(id)
}
</script>

<template>
  <LessonFooter :tone="feedback.tone" :title="feedback.title" :message="feedback.message" :wide="isCode">
    <template v-if="secondaryActions.length" #secondary>
      <ExerciseMoreActions :key="exercise.id" :actions="secondaryActions" @select="runSecondaryAction" />
    </template>
    <template #navigation>
      <UiButton variant="ghost" :disabled="busy" :aria-label="t('Previous step')" @click="emit('back')">
        <Icon name="arrow-left" :size="18" />{{ t('Go back') }}
      </UiButton>
    </template>
    <template #message>
      <Markdown :src="feedback.message" />
    </template>
    <template #left>
      <template v-if="exercise.type === 'learn'">
        <UiButton v-if="canSkipLearn" variant="ghost" @click="emit('know-it')">{{ t('I know this — skip') }}</UiButton>
        <UiButton variant="ghost" @click="emit('ask')"><Icon name="chat" :size="18" />{{ t('Ask a follow-up') }}</UiButton>
      </template>
      <UiButton v-else-if="isPractice && !result" variant="ghost" :disabled="busy" @click="emit('solution')">{{ t('Show solution') }}</UiButton>
      <template v-else>
        <UiButton v-if="isPractice" variant="ghost" @click="emit('ask')">{{ t('Ask a follow-up') }}</UiButton>
        <UiButton v-else-if="exercise.type === 'open'" variant="ghost" :disabled="busy" @click="emit('dont-know')">{{ t('I don\'t know') }}</UiButton>
        <UiButton v-else variant="ghost" :disabled="busy" @click="emit('skip')">{{ isChallenge ? t('Skip challenge') : t('Skip') }}</UiButton>
        <UiButton v-if="!isChoice" variant="ghost" :disabled="busy" @click="emit('ask')">
          <Icon name="chat" :size="18" />{{ t('Hint') }}
        </UiButton>
      </template>
    </template>

    <UiButton v-if="exercise.type === 'learn'" variant="green" size="lg" @click="emit('next')">{{ nextStep ? t('Next step') : t('Got it') }}</UiButton>
    <UiButton v-else-if="isError" variant="primary" @click="emit('retry')">{{ t('Try again') }}</UiButton>
    <template v-else-if="isPractice && result && !isError">
      <UiButton variant="green" size="lg" @click="emit('next')">{{ t('Continue') }}<Icon name="arrow-right" :size="18" /></UiButton>
    </template>
    <template v-else-if="feedback.tone === 'idle'">
      <UiButton v-if="busy" variant="primary" size="lg" loading>{{ t('Checking…') }}</UiButton>
      <UiButton v-else :variant="!canCheck ? 'default' : isCode ? 'primary' : 'green'" size="lg" :disabled="!canCheck" @click="emit('check')">
        {{ isPractice ? t('Check practice answer') : isCode ? t('Check with {0}', [providerName]) : t('Check') }}
      </UiButton>
    </template>
    <template v-else-if="color">
      <UiButton :variant="color" size="lg" @click="emit('next')">{{ feedback.tone === 'wrong' ? t('Got it') : t('Continue') }}<Icon name="arrow-right" :size="18" /></UiButton>
    </template>
    <UiButton v-else variant="primary" size="lg" @click="emit('next')">{{ t('Continue') }}</UiButton>
  </LessonFooter>
</template>
