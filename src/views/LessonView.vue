<script setup lang="ts">
import { t } from '../lib/i18n.ts'
import { computed, nextTick, onBeforeUnmount, onMounted, shallowRef, useTemplateRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useApp } from '../stores/app.ts'
import { getAiProvider } from '../lib/ai-providers.ts'
import { useLessonAssessment } from '../composables/useLessonAssessment.ts'
import { useLessonExamples } from '../composables/useLessonExamples.ts'
import { useLessonSession } from '../composables/useLessonSession.ts'
import { provideLessonSupport } from '../composables/useLessonSupport.ts'
import { buildLessonChatContext } from '../lib/lesson-context.ts'
import { play } from '../lib/sfx.ts'
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
import ExerciseSupport from '../components/exercises/ExerciseSupport.vue'

const route = useRoute()
const router = useRouter()
const app = useApp()
const support = provideLessonSupport()

const lessonId = computed(() => route.params.id as string)
const {
  phase, loadError, level, levels, exerciseIndex, meta, intro, gen, exercises, exercise, estimate, summary,
  load, regenerate, finish, commitTime,
} = useLessonSession(lessonId)
const providerName = computed(() => getAiProvider(app.settings.provider).shortName)

const stage = useTemplateRef('stage')
const codeEditor = useTemplateRef('codeEditor')
const {
  answers, issues, result, answeredCount, busy, xp, canCheck, codeRetrying,
  initialize, reset, accuracyFor, masteryFor, check, retryExercise, skipExercise, dontKnow, revealSolution,
} = useLessonAssessment({
  currentExercise: exercise,
  title: () => meta.value?.title,
  editor: codeEditor,
  isAssisted: support.isAssisted,
  onSolution: (id) => support.mark(id, 'solution'),
  onFeedback: (selector) => nextTick(() => {
    stage.value?.querySelector(selector)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }),
})

function resetLesson(loadedExercises) {
  support.reset()
  reset(loadedExercises)
}

const progress = computed(() => {
  if (phase.value === 'summary') return 100
  if (phase.value === 'intro' || phase.value === 'loading') return 0
  const completed = exerciseIndex.value + (result.value ? 1 : 0)
  return Math.round((completed / (exercises.value.length || 1)) * 100)
})

function skip() {
  if (exercise.value.stage === 'challenge') return next()
  skipExercise()
}

function saveConcept({ term, explanation }) {
  app.addWeakSpot(term)
  app.addFlashcards([{ front: t('What does {0} mean?', [term]), back: explanation }], t('concept from lesson: {0}', [meta.value?.title]))
}

const showTrace = shallowRef(false)
const {
  activeVariant, comparisonVariant, comparisonStep, hasNextComparisonStep,
  selectVariant, nextComparisonStep, previousComparisonStep, traceProgress, requestTrace,
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

function back() {
  if (busy.value) return
  if (showTrace.value) {
    showTrace.value = false
    return
  }
  if (previousComparisonStep()) return
  if (exerciseIndex.value > 0) goToExercise(exerciseIndex.value - 1)
  else phase.value = 'intro'
}

async function startLesson() {
  phase.value = 'play'
  await nextTick()
  const heading = stage.value?.querySelector('h1')
  heading?.setAttribute('tabindex', '-1')
  heading?.focus()
}

function goToExercise(index: number) {
  selectVariant(0)
  showTrace.value = false
  drawerOpen.value = false
  drawer.value?.reset()
  window.scrollTo({ top: 0 })
  if (index < exercises.value.length) {
    exerciseIndex.value = index
    return
  }
  finish(xp.value, accuracyFor(exercises.value), masteryFor(exercises.value))
  play('complete')
}

function close() {
  if (phase.value === 'play' && answeredCount.value && !confirm(t('Leave this lesson? Progress in this lesson won\'t be saved, but flashcards from mistakes will be kept.'))) return
  router.push('/path')
}

// Tutor chat

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

async function loadChatContext() {
  const current = exercise.value
  if (!current) return ''
  const snapshot = current.type === 'code' ? await codeEditor.value?.getChatContext() : undefined
  return buildLessonChatContext({
    exercise: current,
    answer: answers[current.id],
    result: result.value,
    title: meta.value?.title,
    moduleTitle: meta.value?.module?.title,
    experience: app.profile?.description,
    files: snapshot?.files,
    testRun: snapshot?.testRun,
  })
}

function openAsk() {
  drawerOpen.value = true
}
function explainInChat() {
  drawerOpen.value = true
  const current = exercise.value
  drawer.value?.explain({ exercise: current, chosenIndex: answers[current.id] })
}

// Exercise keyboard shortcuts

function onKey(e: KeyboardEvent) {
  if (e.defaultPrevented || e.repeat || e.altKey || e.shiftKey || phase.value !== 'play' || drawerOpen.value) return
  if (showTrace.value && exercise.value?.type === 'learn') return
  const target = e.target as HTMLElement
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
  if (!meta.value || meta.value.status === 'locked') router.replace('/path')
  else load(initialize)
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
      <button type="button" class="close-lesson" :aria-label="t('Close lesson')" @click="close">
        <Icon name="x" :size="24" :stroke="2.8" />
      </button>
      <div class="lesson-progress">
        <div v-if="phase === 'play'" class="progress-label">
          <span class="lesson-name">{{ meta?.title }}</span>
          <span class="count">{{ exerciseIndex + 1 }} / {{ exercises.length }}</span>
        </div>
        <div class="bar progress-bar" role="progressbar" :aria-label="t('Lesson progress')" :aria-valuenow="progress">
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
      @retry="regenerate(resetLesson)"
    />

    <main v-else-if="phase === 'intro'" class="stage">
      <LessonIntro v-model:level="level" :meta="meta" :intro="intro" :levels="levels" />
    </main>

    <LessonSummary
      v-else-if="phase === 'summary'"
      :title="meta?.title || ''"
      :module-index="meta?.moduleIndex || 0"
      :xp="summary.xp"
      :accuracy="summary.accuracy"
      :elapsed="summary.elapsed"
      :mastery="summary.mastery"
    />

    <!-- Exercises -->
    <main v-else-if="exercise" ref="stage" class="stage">
      <div class="inner" :key="exercise.id">
        <LessonTracePanel
          v-if="showTrace && (exercise.type === 'learn' || exercise.type === 'choice')"
          :exercise="exercise"
          :chosen-index="exercise.type === 'choice' ? (answers[exercise.id] as number | null) : null"
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
          :model-value="answers[exercise.id] as string"
          @update:model-value="answers[exercise.id] = $event"
          :exercise="exercise"
          :result="result"
          :busy="busy"
          :provider-name="providerName"
          @submit="check"
        />
        <ChoiceExercise
          v-else-if="exercise.type === 'choice'"
          :model-value="answers[exercise.id] as number | null"
          :exercise="exercise"
          :result="result"
          @update:model-value="answers[exercise.id] = $event"
        />
        <CodeExercise
          v-else-if="exercise.type === 'code'"
          ref="codeEditor"
          :model-value="answers[exercise.id] as string"
          @update:model-value="answers[exercise.id] = $event"
          v-model:issues="issues[exercise.id]"
          :exercise="exercise"
          :result="result"
          :busy="busy"
          @submit="check"
        />
        <ExerciseSupport v-if="exercise.type === 'choice' || exercise.type === 'open'" :exercise="exercise" :busy="busy" />
      </div>
    </main>

    <LessonFooter v-if="phase === 'intro'" tone="idle">
      <template #left>
        <span class="intro-stats">
          <span>~{{ estimate.minutes }} min</span><span aria-hidden="true">·</span>
          <span>{{ t('Exercises: {0}', [estimate.count]) }}</span><span aria-hidden="true">·</span>
          <span class="xp">{{ t('up to +') }}{{ estimate.xp }} XP</span>
        </span>
      </template>
      <button type="button" class="btn btn-primary btn-lg" @click="startLesson">
        {{ meta?.kind === 'test' ? t('Start assessment') : t('Start learning') }}
      </button>
    </LessonFooter>

    <LessonFooter v-else-if="phase === 'summary'" tone="idle">
      <template #left>
        <RouterLink v-if="app.dueCards.length" to="/review" class="btn btn-ghost">{{ t('Flashcards (') }}{{ app.dueCards.length }})</RouterLink>
      </template>
      <RouterLink to="/path" class="btn btn-primary btn-lg">{{ t('Continue') }}</RouterLink>
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
      @back="back"
      @ask="openAsk"
      @check="check"
      @dont-know="dontKnow"
      @know-it="advanceExercise"
      @next="next"
      @retry="retryExercise"
      @skip="skip"
      @solution="revealSolution"
      @trace="openTrace"
    />

    <AskDrawer ref="drawer" :open="drawerOpen" :context="drawerContext" :load-context="loadChatContext" @close="drawerOpen = false" @help="exercise && support.mark(exercise.id, 'tutor')" />
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
