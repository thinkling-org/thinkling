import type { Ref } from 'vue'
import type { CodeIssue, CodeReview, Exercise, ExerciseResult, Grade, TestRun, WorkspaceFile } from '../domain.ts'

interface ExerciseEditor {
  runnable: boolean
  runAll(): Promise<TestRun> | undefined
  getFiles(): Promise<WorkspaceFile[]>
  showReview(): void
}

import { t } from '../lib/i18n.ts'
import { computed, reactive, shallowRef, watch } from 'vue'
import { useApp } from '../stores/app.ts'
import { ai } from '../lib/api.ts'
import { allTestsPassed } from '../lib/runner.ts'
import { play, prepareSfx } from '../lib/sfx.ts'

export function useLessonAssessment({ currentExercise, title, editor, onFeedback }: {
  currentExercise: Readonly<Ref<Exercise | undefined>>
  title: () => string | undefined
  editor: Readonly<Ref<ExerciseEditor | null>>
  onFeedback: (selector: string) => void
}) {
  const app = useApp()
  const answers = reactive<Record<string, string | number | null>>({})
  const results = reactive<Record<string, ExerciseResult>>({})
  const issues = reactive<Record<string, CodeIssue[]>>({})
  const busy = shallowRef(false)
  const xp = shallowRef(0)
  const result = computed(() => currentExercise.value ? results[currentExercise.value.id] : null)
  const answeredCount = computed(() => Object.keys(results).length)

  function initialize(exercises: Exercise[]) {
    for (const exercise of exercises) {
      if (answers[exercise.id] !== undefined) continue
      answers[exercise.id] = exercise.type === 'choice' ? null : exercise.type === 'code' ? exercise.starterCode || '' : ''
      if (exercise.type === 'code') issues[exercise.id] = []
    }
  }

  const canCheck = computed(() => {
    if (!currentExercise.value || busy.value) return false
    if (result.value && !(currentExercise.value.type === 'code' && result.value.retry)) return false
    const answer = answers[currentExercise.value.id]
    if (currentExercise.value.type === 'choice') return answer !== null && answer !== undefined
    if (currentExercise.value.type === 'open') return String(answer || '').trim().length >= 3
    return true
  })

  async function check() {
    if (!canCheck.value) return
    prepareSfx()
    const exercise = currentExercise.value
    if (exercise.type === 'choice') return checkChoice(exercise)
    if (exercise.type === 'open') return checkOpen(exercise)
    if (exercise.type === 'code') return checkCode(exercise)
  }

  function checkChoice(exercise: Exercise) {
    if (exercise.stage === 'practice') return revealPractice(exercise, true)
    const ok = answers[exercise.id] === exercise.correctIndex
    results[exercise.id] = { status: ok ? 'correct' : 'wrong' }
    onFeedback('.explain')
    if (exercise.stage === 'challenge') return
    if (exercise.warmup) {
      // The warm-up before a concept card does not count toward the score or create a flashcard.
      xp.value += ok ? 5 : 2
      return
    }
    app.recordAnswer({ score: ok ? 1 : 0 })
    if (ok) xp.value += 10
    else {
      const front = `${exercise.prompt}${exercise.code ? `\n\n\`\`\`${exercise.codeLanguage || ''}\n${exercise.code}\n\`\`\`` : ''}`
      app.addFlashcards([{ front, back: `**${exercise.options[exercise.correctIndex]}**\n\n${exercise.explanation}` }], t('mistake from lesson: {0}', [title()]))
    }
  }

  function revealPractice(exercise: Exercise, submitted = false) {
    play(submitted ? (answers[exercise.id] === exercise.correctIndex ? 'correct' : 'almost') : 'pop')
    results[exercise.id] = { status: 'practice' }
    onFeedback('.explain')
  }

  async function checkOpen(exercise: Exercise) {
    busy.value = true
    try {
      const data = await ai<Grade>('gradeOpen', { exercise, answer: answers[exercise.id], level: app.plan?.level })
      const status = data.verdict || (data.score >= 8 ? 'correct' : data.score >= 5 ? 'almost' : 'wrong')
      results[exercise.id] = { status, data }
      app.recordAnswer({ score: (data.score || 0) / 10, weakSpot: data.weakSpot })
      xp.value += Math.max(1, data.score || 0)
      if (data.flashcard?.front) app.addFlashcards([data.flashcard], t('from a mistake in lesson: {0}', [title()]))
    } catch (err) {
      results[exercise.id] = { status: 'error', error: err.message }
    } finally {
      busy.value = false
    }
  }

  async function checkCode(exercise: Exercise) {
    busy.value = true
    try {
      let run: TestRun | null = null
      if (editor.value?.runnable) run = await editor.value.runAll()
      editor.value?.showReview()
      const payload: { exercise: Exercise; testResults: TestRun | null; level?: string; files?: WorkspaceFile[]; code?: string | number | null } = { exercise, testResults: run, level: app.plan?.level }
      if (exercise.runtime === 'docker') payload.files = await editor.value.getFiles()
      else payload.code = answers[exercise.id]
      const data = await ai<CodeReview>('reviewCode', payload)
      // Use the model’s review when tests have not been verified.
      const testsOk = !run || allTestsPassed(run) || exercise.testsStatus === 'unverified'
      const status = data.passed && testsOk ? 'correct' : data.score >= 5 ? 'almost' : 'wrong'
      const prev = results[exercise.id]?.status
      results[exercise.id] = { status, data }
      issues[exercise.id] = data.issues || []
      if (!prev || prev === 'error') {
        app.recordAnswer({ score: (data.score || 0) / 10, weakSpot: data.weakSpot })
        xp.value += status === 'correct' ? 20 : status === 'almost' ? 10 : 3
        if (data.flashcard?.front) app.addFlashcards([data.flashcard], t('from exercise: {0}', [exercise.title]))
      } else if (status === 'correct' && prev !== 'correct') {
        xp.value += 5 // poprawka po review
      }
    } catch (err) {
      results[exercise.id] = { status: 'error', error: err.message }
    } finally {
      busy.value = false
    }
  }

  function retryExercise() {
    if (result.value.status === 'error') delete results[currentExercise.value.id]
    else result.value.retry = true
  }

  const codeRetrying = computed(() => currentExercise.value?.type === 'code' && result.value?.retry)

  watch(
    () => [currentExercise.value?.id, result.value?.status],
    ([id, status], [previousId, previousStatus]) => {
      if (!status || id !== previousId || status === previousStatus) return
      if (status === 'correct') play('correct')
      else if (status === 'almost') play('almost')
      else if (status === 'wrong') play(currentExercise.value?.warmup ? 'almost' : 'wrong')
      else if (status === 'unknown') play('pop', 0.8)
    },
  )
  watch(
    () => (currentExercise.value?.type === 'choice' ? answers[currentExercise.value.id] : undefined),
    (v, old) => {
      if (v !== undefined && v !== null && v !== old && !result.value) play('tick')
    },
  )

  function skipExercise() {
    const exercise = currentExercise.value
    if (exercise.stage === 'practice') return revealPractice(exercise)
    results[exercise.id] = { status: 'skipped' }
    if (!exercise.warmup) app.recordAnswer({ score: 0 })
  }

  /** Show the reference answer and add a flashcard when the learner skips an open question. */
  function dontKnow() {
    const exercise = currentExercise.value
    results[exercise.id] = { status: 'unknown' }
    app.recordAnswer({ score: 0 })
    app.addFlashcards([{ front: exercise.prompt, back: exercise.referenceAnswer }], t('“I don\'t know” in lesson: {0}', [title()]))
    onFeedback('.feedback')
  }

  function reset(exercises: Exercise[]) {
    for (const state of [answers, results, issues]) {
      for (const key of Object.keys(state)) delete state[key]
    }
    initialize(exercises)
  }

  function accuracyFor(exercises: Exercise[]) {
    const graded = exercises.filter((exercise) => exercise.stage
      ? exercise.stage === 'check'
      : exercise.type !== 'learn' && !exercise.warmup)
    const correct = graded.filter((exercise) => results[exercise.id]?.status === 'correct').length
    return graded.length ? Math.round((correct / graded.length) * 100) : 100
  }

  return {
    answers, issues, result, answeredCount, busy, xp, canCheck, codeRetrying,
    initialize, reset, accuracyFor, check, retryExercise, skipExercise, dontKnow,
  }
}
