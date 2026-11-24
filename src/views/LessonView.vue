<script setup>
import { t } from '../lib/i18n.js'
import { computed, nextTick, onBeforeUnmount, onMounted, shallowRef, useTemplateRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useApp } from '../stores/app.js'
import { useLessonAssessment } from '../composables/useLessonAssessment.js'
import { useLessonExamples } from '../composables/useLessonExamples.js'
import { buildLessonChatContext } from '../lib/lesson-context.js'
import { play } from '../lib/sfx.js'
import Icon from '../components/Icon.vue'
import LessonFooter from '../components/LessonFooter.vue'
import LessonIntro from '../components/LessonIntro.vue'
import LessonPreparation from '../components/lesson/LessonPreparation.vue'
import LessonSummary from '../components/lesson/LessonSummary.vue'
import LessonTracePanel from '../components/lesson/LessonTracePanel.vue'
import AskDrawer from '../components/AskDrawer.vue'
import ExerciseFooter from '../components/exercises/ExerciseFooter.vue'
import OpenExercise from '../components/exercises/OpenExercise.vue'
import LearnCard from '../components/exercises/LearnCard.vue'
import ChoiceExercise from '../components/exercises/ChoiceExercise.vue'
import CodeExercise from '../components/exercises/CodeExercise.vue'

const route = useRoute()
const router = useRouter()
const app = useApp()

const lessonId = computed(() => route.params.id)
const meta = computed(() => app.findLesson(lessonId.value))
const lesson = computed(() => app.lessons[lessonId.value])
const intro = computed(() => lesson.value?.intro)
const gen = computed(() => app.lessonGen[lessonId.value])
const allExercises = computed(() => lesson.value?.exercises || [])

// Uczeń deklaruje na ekranie powitalnym, ile już wie; od tego zależy, ile teorii zobaczy.
const LEVELS = [
  { label: t('Pierwszy raz słyszę'), plan: t('Zaczniemy od podstaw i przykładów, bez pośpiechu.'), pick: (list) => list },
  {
    label: t('Coś kojarzę'),
    plan: t('Jedna karta przypomnienia, potem od razu ćwiczenia.'),
    pick: (list) => list.filter((e, k) => e.stage !== 'learn' || list.findIndex((x) => x.stage === 'learn') === k),
  },
  {
    label: t('Znam, chcę powtórkę'),
    plan: t('Od razu pytania sprawdzające, bez teorii. Wyjaśnienie zobaczysz po każdej odpowiedzi.'),
    pick: (list) => list.filter((e) => e.stage === 'check' || e.stage === 'challenge'),
  },
]
const level = shallowRef(0)
const levels = computed(() => {
  if (meta.value?.kind === 'test') return []
  return LEVELS.map((option) => ({ ...option, exercises: option.pick(allExercises.value) }))
    .filter((option, k) => k === 0 || option.exercises.length)
})
const exercises = computed(() => levels.value[level.value]?.exercises || allExercises.value)
const MINUTES = { learn: 2, choice: 1, open: 2, code: 5 }
const estimate = computed(() => {
  const list = exercises.value
  const minutes = Math.max(1, Math.round(list.reduce((sum, e) => sum + (MINUTES[e.type] || 1), 0)))
  const graded = list.filter((e) => e.stage === 'check')
  const xpMax = graded.reduce((sum, e) => sum + (e.type === 'code' ? 20 : 10), 0) + (meta.value?.status === 'done' ? 5 : 20)
  const n = list.length
  const noun = n === 1 ? t('ćwiczenie') : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? t('ćwiczenia') : t('ćwiczeń')
  return { minutes, count: `${n} ${noun}`, xp: xpMax }
})
const providerName = computed(() => (app.settings.provider === 'codex' ? 'Codex' : 'Claude'))

const phase = shallowRef('loading') // loading | error | intro | play | summary
const loadError = shallowRef('')
const exerciseIndex = shallowRef(0)
const stage = useTemplateRef('stage')
const codeEditor = useTemplateRef('codeEditor')
const bonus = shallowRef(0)
const startedAt = Date.now()
let timeCommitted = false

const exercise = computed(() => exercises.value[exerciseIndex.value])
const {
  answers, issues, result, answeredCount, busy, xp, canCheck, codeRetrying,
  initialize, reset, accuracyFor, check, retryExercise, skipExercise, dontKnow,
} = useLessonAssessment({
  currentExercise: exercise,
  title: () => meta.value?.title,
  editor: codeEditor,
  onFeedback: (selector) => nextTick(() => {
    stage.value?.querySelector(selector)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }),
})

const progress = computed(() => {
  if (phase.value === 'summary') return 100
  if (phase.value === 'intro' || phase.value === 'loading') return 0
  const completed = exerciseIndex.value + (result.value ? 1 : 0)
  return Math.round((completed / (exercises.value.length || 1)) * 100)
})

async function load() {
  if (!meta.value || meta.value.status === 'locked') return router.replace('/path')
  phase.value = 'loading'
  loadError.value = ''
  try {
    await app.ensureLesson(lessonId.value)
    initialize(allExercises.value)
    phase.value = 'intro'
  } catch (err) {
    loadError.value = err.message
    phase.value = 'error'
  }
}

async function regenerate() {
  phase.value = 'loading'
  try {
    await app.regenerateLesson(lessonId.value)
    exerciseIndex.value = 0
    level.value = 0
    reset(allExercises.value)
    phase.value = 'intro'
  } catch (err) {
    loadError.value = err.message
    phase.value = 'error'
  }
}

function skip() {
  if (exercise.value.stage === 'challenge') return next()
  skipExercise()
}

function saveConcept({ term, explanation }) {
  app.addWeakSpot(term)
  app.addFlashcards([{ front: t('Co oznacza {0}?', [term]), back: explanation }], t('pojęcie z lekcji: {0}', [meta.value?.title]))
}

const showTrace = shallowRef(false)
const {
  activeVariant, comparisonVariant, comparisonStep, hasNextComparisonStep,
  selectVariant, nextComparisonStep, traceProgress, requestTrace,
} = useLessonExamples(exercise)

function openTrace() {
  const current = exercise.value
  if (!current) return
  if (!current.code) return explainInChat()
  showTrace.value = true
  window.scrollTo({ top: 0 })
  return requestTrace(answers[current.id])
}

function next() {
  if (nextComparisonStep()) {
    play('pop', 1.2)
    return
  }
  advanceExercise()
}

function advanceExercise() {
  if (exercise.value?.type === 'learn') play('pop', 1.2)
  goToExercise(exerciseIndex.value + 1)
}

async function startLesson() {
  phase.value = 'play'
  await nextTick()
  const heading = stage.value?.querySelector('h1')
  heading?.setAttribute('tabindex', '-1')
  heading?.focus()
}

function goToExercise(index) {
  selectVariant(0)
  showTrace.value = false
  drawerOpen.value = false
  drawer.value?.reset()
  window.scrollTo({ top: 0 })
  if (index >= exercises.value.length) finish()
  else exerciseIndex.value = index
}

function finish() {
  accuracy.value = accuracyFor(exercises.value)
  bonus.value = app.completeLesson(lessonId.value, { xp: xp.value }) || 0
  commitTime()
  play('complete')
  phase.value = 'summary'
}

const accuracy = shallowRef(0)
const elapsedText = computed(() => {
  const s = Math.round((Date.now() - startedAt) / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
})

function commitTime() {
  if (timeCommitted) return
  timeCommitted = true
  app.addTime(Math.min((Date.now() - startedAt) / 1000, 3 * 60 * 60))
}

function close() {
  if (phase.value === 'play' && answeredCount.value && !confirm(t('Przerwać lekcję? Postęp tej lekcji nie zostanie zapisany (fiszki z błędów zostają).'))) return
  router.push('/path')
}

// ------------------------------------------------------------- dopytaj

const drawer = useTemplateRef('drawer')
const drawerOpen = shallowRef(false)
const drawerContext = computed(() => exercise.value ? buildLessonChatContext({
  exercise: exercise.value,
  answer: answers[exercise.value.id],
  result: result.value,
  title: meta.value?.title,
  moduleTitle: meta.value?.module?.title,
  experience: app.profile?.description,
}) : '')

function openAsk() {
  drawerOpen.value = true
}
function explainInChat() {
  drawerOpen.value = true
  const current = exercise.value
  drawer.value?.explain({ exercise: current, chosenIndex: answers[current.id] })
}

// ------------------------------------------------------------- klawiatura

function onKey(e) {
  if (e.defaultPrevented || e.repeat || e.altKey || e.shiftKey || phase.value !== 'play' || drawerOpen.value) return
  if (showTrace.value && exercise.value?.type === 'learn') return
  const target = e.target
  const typing = target.closest?.('textarea, input, .monaco-editor') || target.isContentEditable
  if (target.closest?.('button, a, select, summary, audio, [role=button]')) return
  if (e.key === 'Enter' && (!typing || e.ctrlKey || e.metaKey)) {
    if (exercise.value?.type === 'learn' || (result.value && !codeRetrying.value)) {
      e.preventDefault()
      next()
    } else if (canCheck.value && exercise.value.type !== 'code') {
      e.preventDefault()
      check()
    }
  }
  if (!typing && !e.ctrlKey && !e.metaKey && exercise.value?.type === 'choice' && !result.value) {
    const n = Number(e.key)
    if (Number.isInteger(n) && n >= 1 && n <= exercise.value.options.length) answers[exercise.value.id] = n - 1
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  load()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  if (phase.value !== 'summary' && answeredCount.value) commitTime()
})

const wide = computed(() => phase.value === 'play' && exercise.value?.type === 'code')
</script>

<template>
  <div class="lesson" :class="{ wide, tracing: showTrace, 'ask-open': drawerOpen }">
    <header class="lesson-header">
      <button type="button" class="close-lesson" :aria-label="t('Zamknij lekcję')" @click="close">
        <Icon name="x" :size="24" :stroke="2.8" />
      </button>
      <div class="lesson-progress">
        <div v-if="phase === 'play'" class="progress-label">
          <span class="lesson-name">{{ meta?.title }}</span>
          <span class="count">{{ exerciseIndex + 1 }} / {{ exercises.length }}</span>
        </div>
        <div class="bar progress-bar" role="progressbar" :aria-label="t('Postęp lekcji')" :aria-valuenow="progress">
          <div :style="{ width: `${progress}%` }" />
        </div>
      </div>
    </header>

    <LessonPreparation
      v-if="phase === 'loading' || phase === 'error'"
      :loading="phase === 'loading'"
      :title="meta?.title || ''"
      :module-index="meta?.moduleIndex || 0"
      :provider-name="providerName"
      :generation="gen"
      :error="loadError"
      @retry="regenerate"
    />

    <main v-else-if="phase === 'intro'" class="stage">
      <LessonIntro v-model:level="level" :meta="meta" :intro="intro" :levels="levels" />
    </main>

    <LessonSummary
      v-else-if="phase === 'summary'"
      :title="meta?.title || ''"
      :module-index="meta?.moduleIndex || 0"
      :xp="xp + bonus"
      :accuracy="accuracy"
      :elapsed="elapsedText"
    />

    <!-- ćwiczenia -->
    <main v-else-if="exercise" ref="stage" class="stage">
      <div class="inner" :key="exercise.id">
        <LessonTracePanel
          v-if="showTrace && (exercise.type === 'learn' || exercise.type === 'choice')"
          :exercise="exercise"
          :chosen-index="exercise.type === 'choice' ? answers[exercise.id] : null"
          :progress="traceProgress"
          :provider-name="providerName"
          @close="showTrace = false"
          @retry="openTrace"
        />
        <LearnCard
          v-else-if="exercise.type === 'learn'"
          :active-variant="activeVariant"
          :comparison-step="comparisonStep"
          :exercise="exercise"
          @update:active-variant="selectVariant"
          @trace="openTrace"
          @review-concept="saveConcept"
        />
        <OpenExercise
          v-else-if="exercise.type === 'open'"
          v-model="answers[exercise.id]"
          :exercise="exercise"
          :result="result"
          :busy="busy"
          :provider-name="providerName"
          @submit="check"
        />
        <ChoiceExercise v-else-if="exercise.type === 'choice'" v-model="answers[exercise.id]" :exercise="exercise" :result="result" />
        <CodeExercise
          v-else-if="exercise.type === 'code'"
          ref="codeEditor"
          v-model="answers[exercise.id]"
          v-model:issues="issues[exercise.id]"
          :exercise="exercise"
          :result="result"
          :busy="busy"
          @submit="check"
        />
      </div>
    </main>

    <LessonFooter v-if="phase === 'intro'" tone="idle">
      <template #left>
        <span class="intro-stats">
          <span>~{{ estimate.minutes }} min</span><span aria-hidden="true">·</span>
          <span>{{ estimate.count }}</span><span aria-hidden="true">·</span>
          <span class="xp">{{ t('do +') }}{{ estimate.xp }} XP</span>
        </span>
      </template>
      <button type="button" class="btn btn-primary btn-lg" @click="startLesson">
        {{ meta?.kind === 'test' ? t('Rozpocznij sprawdzian') : t('Zacznij naukę') }}
      </button>
    </LessonFooter>

    <LessonFooter v-else-if="phase === 'summary'" tone="idle">
      <template #left>
        <RouterLink v-if="app.dueCards.length" to="/review" class="btn btn-ghost">{{ t('Fiszki (') }}{{ app.dueCards.length }})</RouterLink>
      </template>
      <RouterLink to="/path" class="btn btn-primary btn-lg">{{ t('Dalej') }}</RouterLink>
    </LessonFooter>

    <ExerciseFooter
      v-else-if="phase === 'play' && exercise"
      :exercise="exercise"
      :result="result"
      :provider-name="providerName"
      :busy="busy"
      :can-check="canCheck"
      :tracing="showTrace"
      :next-step="hasNextComparisonStep"
      :can-skip-learn="!comparisonVariant || hasNextComparisonStep"
      @ask="openAsk"
      @check="check"
      @dont-know="dontKnow"
      @know-it="advanceExercise"
      @next="next"
      @retry="retryExercise"
      @skip="skip"
      @trace="openTrace"
    />

    <AskDrawer ref="drawer" :open="drawerOpen" :context="drawerContext" @close="drawerOpen = false" />
  </div>
</template>

<style scoped>
.lesson {
  --ask-width: clamp(340px, 28vw, 440px);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
@media (min-width: 1100px) {
  .lesson.ask-open {
    padding-right: var(--ask-width);
  }
}
.lesson-header {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  max-width: 1100px;
  margin: 0 auto;
  padding: 16px 24px;
}
.wide .lesson-header {
  max-width: none;
}
.close-lesson {
  flex: none;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  color: var(--text-3);
  cursor: pointer;
}
.close-lesson:hover {
  color: var(--text);
}
.lesson-progress {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 6px;
}
.progress-label {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  font-size: 0.875rem;
  font-weight: 800;
}
.lesson-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-3);
}
.count {
  flex: none;
  font-variant-numeric: tabular-nums;
  color: var(--muted);
}
.progress-bar {
  height: 10px;
}
.progress-bar > div::after {
  content: none;
}
.stage {
  flex: 1;
  min-width: 0;
  display: flex;
  justify-content: center;
  padding: 20px 24px 32px;
}
.inner {
  width: 100%;
  max-width: 760px;
  animation: dl-pop 0.25s ease-out;
}
.intro-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  color: var(--muted);
  font-size: 15px;
  font-weight: 800;
}
.intro-stats .xp {
  color: var(--blue);
}
.wide .stage {
  padding: 4px 28px 20px;
}
.lesson.tracing .inner {
  max-width: 1100px;
}
.wide .inner {
  max-width: none;
}
@media (max-width: 700px) {
  .lesson-header {
    gap: 10px;
    padding: 12px 16px;
  }
  .stage,
  .wide .stage {
    padding: 8px 16px 24px;
  }
}
</style>
