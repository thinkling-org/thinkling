<script setup>
import { computed } from 'vue'
import { firstSentence } from '../../lib/markdown.js'
import Icon from '../Icon.vue'
import LessonFooter from '../LessonFooter.vue'
import Markdown from '../Markdown.vue'

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
const emit = defineEmits(['ask', 'check', 'dont-know', 'know-it', 'next', 'retry', 'skip', 'trace'])

const TITLES = { correct: 'Świetnie!', almost: 'Prawie!', wrong: 'Jeszcze nie' }
const BUTTON_COLORS = { correct: 'green', almost: 'yellow', wrong: 'red' }
const isChoice = computed(() => props.exercise.type === 'choice')
const isCode = computed(() => props.exercise.type === 'code')
const isError = computed(() => props.result?.status === 'error')
const isPractice = computed(() => props.exercise.stage === 'practice')
const isChallenge = computed(() => props.exercise.stage === 'challenge')

const feedback = computed(() => {
  const { exercise, result } = props
  if (!result || isPractice.value || (isCode.value && result.retry)) return { tone: 'idle' }
  const { status, error, data } = result
  if (isError.value) return { tone: 'wrong', title: 'Coś poszło nie tak', message: error }
  if (status === 'skipped') return { tone: 'skipped', title: 'Pominięto' }
  if (status === 'unknown') {
    return { tone: 'skipped', title: 'Nic straconego', message: 'Przeczytaj wzorcową odpowiedź — dodałem ją do fiszek.' }
  }
  if (isChoice.value && exercise.warmup) {
    return status === 'correct'
      ? { tone: 'correct', title: 'Dobra intuicja!', message: 'Zobaczmy, dlaczego tak jest.' }
      : { tone: 'almost', title: 'Dobra próba!', message: 'To rozgrzewka — za chwilę wszystko się wyjaśni.' }
  }
  if (isChoice.value) {
    return {
      tone: status,
      title: status === 'correct' ? TITLES.correct : 'Niepoprawnie',
      message: exercise.trace?.headline || firstSentence(exercise.explanation),
    }
  }
  return { tone: status, title: TITLES[status], message: data?.headline }
})

const color = computed(() => BUTTON_COLORS[feedback.value.tone])
const traceLabel = computed(() => {
  if (!isChoice.value || props.tracing || isError.value) return ''
  if (feedback.value.tone === 'wrong') return 'Wyjaśnij krok po kroku'
  if (feedback.value.tone === 'correct' && props.exercise.code && !props.exercise.warmup) return 'Prześledź kod'
  return ''
})
const retryLabel = computed(() => {
  if (isError.value) return 'Spróbuj ponownie'
  if (isCode.value && ['almost', 'wrong'].includes(feedback.value.tone)) return 'Poprawię kod'
  return ''
})
const canAsk = computed(() => !isError.value && (feedback.value.tone !== 'wrong' || !isChoice.value || props.tracing))
</script>

<template>
  <LessonFooter :tone="feedback.tone" :title="feedback.title" :message="feedback.message">
    <template #message>
      <Markdown :src="feedback.message" />
    </template>
    <template #left>
      <template v-if="exercise.type === 'learn'">
        <button v-if="canSkipLearn" class="btn btn-ghost" @click="emit('know-it')">Znam to — pomiń</button>
        <button class="btn btn-ghost" @click="emit('ask')"><Icon name="chat" :size="18" />Dopytaj</button>
      </template>
      <button v-else-if="isPractice && !result" class="btn btn-ghost" @click="emit('skip')">Zobacz rozwiązanie</button>
      <template v-else>
        <button v-if="isPractice" class="btn btn-ghost" @click="emit('ask')">Dopytaj</button>
        <button v-else-if="exercise.type === 'open'" class="btn btn-ghost" :disabled="busy" @click="emit('dont-know')">Nie wiem</button>
        <button v-else class="btn btn-ghost" :disabled="busy" @click="emit('skip')">{{ isChallenge ? 'Pomiń wyzwanie' : 'Pomiń' }}</button>
        <button v-if="!isChoice" class="btn btn-ghost" :disabled="busy" @click="emit('ask')">
          <Icon name="chat" :size="18" />Podpowiedź
        </button>
      </template>
    </template>

    <button v-if="exercise.type === 'learn'" class="btn btn-green btn-lg" @click="emit('next')">{{ nextStep ? 'Następny krok' : 'Rozumiem' }}</button>
    <button v-else-if="isPractice && result" class="btn btn-green btn-lg" @click="emit('next')">Dalej</button>
    <template v-else-if="feedback.tone === 'idle'">
      <button v-if="busy" class="btn btn-primary btn-lg" disabled>
        <span class="spinner" style="border-color: #ffffff55; border-top-color: #fff" />Sprawdzam…
      </button>
      <button v-else class="btn btn-lg" :class="canCheck && (isCode ? 'btn-primary' : 'btn-green')" :disabled="!canCheck" @click="emit('check')">
        {{ isCode ? `Sprawdź z ${providerName}` : isPractice ? 'Sprawdź próbę' : 'Sprawdź' }}
      </button>
    </template>
    <template v-else-if="color">
      <button v-if="traceLabel" class="btn" :class="`btn-ghost-${color}`" @click="emit('trace')">{{ traceLabel }}</button>
      <button v-if="retryLabel" class="btn" :class="`btn-ghost-${color}`" @click="emit('retry')">{{ retryLabel }}</button>
      <button v-if="canAsk" class="btn" :class="`btn-ghost-${color}`" @click="emit('ask')">Dopytaj {{ providerName }}</button>
      <button class="btn btn-lg" :class="`btn-${color}`" @click="emit('next')">{{ feedback.tone === 'wrong' ? 'Rozumiem' : 'Dalej' }}</button>
    </template>
    <button v-else class="btn btn-primary btn-lg" @click="emit('next')">Dalej</button>
  </LessonFooter>
</template>
