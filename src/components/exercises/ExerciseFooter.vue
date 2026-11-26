<script setup lang="ts">
import { t } from '../../lib/i18n.ts'
import { computed } from 'vue'
import { firstSentence } from '../../lib/markdown.ts'
import Icon from '../Icon.vue'
import LessonFooter from '../LessonFooter.vue'
import Markdown from '../Markdown.vue'
import ExerciseMoreActions from './ExerciseMoreActions.vue'

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
const BUTTON_COLORS = { correct: 'green', almost: 'yellow', wrong: 'red' }
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
      <button type="button" class="btn btn-ghost" :disabled="busy" :aria-label="t('Previous step')" @click="emit('back')">
        <Icon name="arrow-left" :size="18" />{{ t('Go back') }}
      </button>
    </template>
    <template #message>
      <Markdown :src="feedback.message" />
    </template>
    <template #left>
      <template v-if="exercise.type === 'learn'">
        <button v-if="canSkipLearn" class="btn btn-ghost" @click="emit('know-it')">{{ t('I know this — skip') }}</button>
        <button class="btn btn-ghost" @click="emit('ask')"><Icon name="chat" :size="18" />{{ t('Ask a follow-up') }}</button>
      </template>
      <button v-else-if="isPractice && !result" class="btn btn-ghost" :disabled="busy" @click="emit('solution')">{{ t('Show solution') }}</button>
      <template v-else>
        <button v-if="isPractice" class="btn btn-ghost" @click="emit('ask')">{{ t('Ask a follow-up') }}</button>
        <button v-else-if="exercise.type === 'open'" class="btn btn-ghost" :disabled="busy" @click="emit('dont-know')">{{ t('I don\'t know') }}</button>
        <button v-else class="btn btn-ghost" :disabled="busy" @click="emit('skip')">{{ isChallenge ? t('Skip challenge') : t('Skip') }}</button>
        <button v-if="!isChoice" class="btn btn-ghost" :disabled="busy" @click="emit('ask')">
          <Icon name="chat" :size="18" />{{ t('Hint') }}
        </button>
      </template>
    </template>

    <button v-if="exercise.type === 'learn'" class="btn btn-green btn-lg" @click="emit('next')">{{ nextStep ? t('Next step') : t('Got it') }}</button>
    <button v-else-if="isError" class="btn btn-primary" @click="emit('retry')">{{ t('Try again') }}</button>
    <template v-else-if="isPractice && result && !isError">
      <button class="btn btn-green btn-lg" @click="emit('next')">{{ t('Continue') }}<Icon name="arrow-right" :size="18" /></button>
    </template>
    <template v-else-if="feedback.tone === 'idle'">
      <button v-if="busy" class="btn btn-primary btn-lg" disabled>
        <span class="spinner" style="border-color: #ffffff55; border-top-color: #fff" />{{ t('Checking…') }}
      </button>
      <button v-else class="btn btn-lg" :class="canCheck && (isCode ? 'btn-primary' : 'btn-green')" :disabled="!canCheck" @click="emit('check')">
        {{ isPractice ? t('Check practice answer') : isCode ? t('Check with {0}', [providerName]) : t('Check') }}
      </button>
    </template>
    <template v-else-if="color">
      <button class="btn btn-lg" :class="`btn-${color}`" @click="emit('next')">{{ feedback.tone === 'wrong' ? t('Got it') : t('Continue') }}<Icon name="arrow-right" :size="18" /></button>
    </template>
    <button v-else class="btn btn-primary btn-lg" @click="emit('next')">{{ t('Continue') }}</button>
  </LessonFooter>
</template>
