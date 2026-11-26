import type { Ref } from 'vue'
import type { CodeIssue, CodeReview, Exercise, ExerciseResult, Grade, LessonMastery, TestRun, WorkspaceFile } from '../domain.ts'

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
import { gradeInteraction } from '../blocks/registry.ts'
import type { GradeResult } from '../blocks/types.ts'
import { play, prepareSfx } from '../lib/sfx.ts'

export function useLessonAssessment({ currentExercise, title, editor, onFeedback, isAssisted = () => false, onSolution = () => {} }: {
  currentExercise: Readonly<Ref<Exercise | undefined>>
  title: () => string | undefined
  editor: Readonly<Ref<ExerciseEditor | null>>
  onFeedback: (selector: string) => void
  isAssisted?: (id: string) => boolean
  onSolution?: (id: string) => void
}) {
  const app = useApp()
  // Interactive exercises store whatever their block reports (e.g. an order or a number).
  const answers = reactive<Record<string, unknown>>({})
  const results = reactive<Record<string, ExerciseResult>>({})
  const issues = reactive<Record<string, CodeIssue[]>>({})
  const busy = shallowRef(false)
  const xp = shallowRef(0)
  const result = computed(() => currentExercise.value ? results[currentExercise.value.id] : null)
  const answeredCount = computed(() => Object.keys(results).length)

  function initialize(exercises: Exercise[]) {
    for (const exercise of exercises) {
      if (answers[exercise.id] !== undefined) continue
      answers[exercise.id] = exercise.type === 'choice' || exercise.type === 'interactive' ? null : exercise.type === 'code' ? exercise.starterCode || '' : ''
      if (exercise.type === 'code') issues[exercise.id] = []
    }
  }

  const canCheck = computed(() => {
    if (!currentExercise.value || busy.value) return false
    if (result.value && !result.value.retry) return false
    const answer = answers[currentExercise.value.id]
    if (currentExercise.value.type === 'choice') return answer !== null && answer !== undefined
    if (currentExercise.value.type === 'open') return String(answer || '').trim().length >= 3
    // The block reports null until its answer is complete.
    if (currentExercise.value.type === 'interactive') return answer !== null && answer !== undefined
    return true
  })

  async function check() {
    if (!canCheck.value) return
    prepareSfx()
    const exercise = currentExercise.value
    if (exercise.type === 'choice') return checkChoice(exercise)
    if (exercise.type === 'open') return checkOpen(exercise)
    if (exercise.type === 'code') return checkCode(exercise)
    if (exercise.type === 'interactive') return checkInteractive(exercise)
  }

  /** The block grades the answer locally and deterministically; no AI call. */
  function checkInteractive(exercise: Exercise) {
    let grade: GradeResult
    try {
      grade = gradeInteraction(exercise, answers[exercise.id])
    } catch (err) {
      results[exercise.id] = { status: 'error', error: err.message }
      return
    }
    results[exercise.id] = {
      status: grade.verdict,
      assisted: isAssisted(exercise.id),
      data: { score: Math.round(grade.score * 10), summary: grade.feedback, feedback: grade.feedback },
    }
    onFeedback('.explain')
    if (exercise.stage === 'practice' || exercise.stage === 'challenge') return
    app.recordAnswer({ score: grade.score })
    xp.value += grade.verdict === 'correct' ? 10 : grade.verdict === 'almost' ? 5 : 0
    if (grade.verdict !== 'correct') {
      app.addFlashcards([{ front: exercise.prompt, back: exercise.explanation || '' }], t('mistake from lesson: {0}', [title()]))
    }
  }

  /** An interactive exercise whose extension is missing or off: move on without affecting the score. */
  function skipUnavailable() {
    const exercise = currentExercise.value
    if (!exercise || result.value) return
    results[exercise.id] = { status: 'skipped', unavailable: true }
  }

  function checkChoice(exercise: Exercise) {
    const ok = answers[exercise.id] === exercise.correctIndex
    results[exercise.id] = { status: ok ? 'correct' : 'wrong', assisted: isAssisted(exercise.id) }
    onFeedback('.explain')
    if (exercise.stage === 'practice') return
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

  function revealSolution() {
    const exercise = currentExercise.value
    if (!exercise || busy.value || exercise.stage !== 'practice') return
    onSolution(exercise.id)
    results[exercise.id] = { status: 'practice', assisted: true, solutionRevealed: true }
    onFeedback('.explain')
  }

  async function checkOpen(exercise: Exercise) {
    busy.value = true
    const assisted = isAssisted(exercise.id)
    try {
      const data = await ai<Grade>('gradeOpen', { exercise, answer: answers[exercise.id], level: app.plan?.level })
      const status = data.verdict || (data.score >= 8 ? 'correct' : data.score >= 5 ? 'almost' : 'wrong')
      results[exercise.id] = { status, data, assisted }
      if (exercise.stage === 'practice') return
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
    const assisted = isAssisted(exercise.id)
    try {
      let run: TestRun | null = null
      if (editor.value?.runnable) run = await editor.value.runAll()
      if (exercise.stage === 'practice' && run && exercise.testsStatus === 'verified') {
        const passed = allTestsPassed(run)
        results[exercise.id] = {
          status: passed ? 'correct' : 'wrong', assisted,
          data: { passed, summary: passed ? t('This part works. Try a similar task next.') : t('Check the failing test and change one thing. You can use a hint and try again.') },
        }
        return
      }
      editor.value?.showReview()
      const payload: { exercise: Exercise; testResults: TestRun | null; level?: string; files?: WorkspaceFile[]; code?: string | number | null } = { exercise, testResults: run, level: app.plan?.level }
      if (exercise.runtime === 'docker') payload.files = await editor.value.getFiles()
      else payload.code = answers[exercise.id] as string
      const data = await ai<CodeReview>('reviewCode', payload)
      // Use the model’s review when tests have not been verified.
      const testsOk = !run || allTestsPassed(run) || exercise.testsStatus === 'unverified'
      const status = data.passed && testsOk ? 'correct' : data.score >= 5 ? 'almost' : 'wrong'
      const prev = results[exercise.id]?.status
      results[exercise.id] = { status, data, assisted }
      issues[exercise.id] = data.issues || []
      if (exercise.stage === 'practice') return
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
    if (!result.value || busy.value) return
    if (result.value.status === 'error' || currentExercise.value.stage === 'practice') delete results[currentExercise.value.id]
    else result.value.retry = true
  }

  const codeRetrying = computed(() => currentExercise.value?.type === 'code' && result.value?.retry)

  watch(
    () => [currentExercise.value?.id, result.value?.status],
    ([id, status], [previousId, previousStatus]) => {
      if (!status || id !== previousId || status === previousStatus) return
      if (status === 'correct') play('correct')
      else if (status === 'almost') play('almost')
      else if (status === 'wrong') play(currentExercise.value?.warmup || currentExercise.value?.stage === 'practice' ? 'almost' : 'wrong')
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
    if (!exercise || busy.value || result.value) return
    if (exercise.stage === 'practice') return revealSolution()
    results[exercise.id] = { status: 'skipped' }
    if (!exercise.warmup) app.recordAnswer({ score: 0 })
  }

  /** Show the reference answer and add a flashcard when the learner skips an open question. */
  function dontKnow() {
    const exercise = currentExercise.value
    if (!exercise || busy.value || result.value) return
    if (exercise.stage === 'practice') return revealSolution()
    onSolution(exercise.id)
    results[exercise.id] = { status: 'unknown' }
    app.recordAnswer({ score: 0 })
    app.addFlashcards([{ front: exercise.prompt, back: exercise.referenceAnswer }], t('“I don\'t know” in lesson: {0}', [title()]))
    onFeedback('.feedback')
  }

  function reset(exercises: Exercise[]) {
    xp.value = 0
    for (const state of [answers, results, issues]) {
      for (const key of Object.keys(state)) delete state[key]
    }
    initialize(exercises)
  }

  function accuracyFor(exercises: Exercise[]) {
    const graded = exercises.filter((exercise) => !results[exercise.id]?.unavailable && (exercise.stage
      ? exercise.stage === 'check'
      : exercise.type !== 'learn' && !exercise.warmup))
    const correct = graded.filter((exercise) => results[exercise.id]?.status === 'correct').length
    return graded.length ? Math.round((correct / graded.length) * 100) : 100
  }

  function masteryFor(exercises: Exercise[]): LessonMastery {
    const checks = exercises.filter(({ id, stage }) => stage === 'check' && !results[id]?.unavailable)
    const correct = checks.filter(({ id }) => results[id]?.status === 'correct')
    return {
      independent: correct.filter(({ id }) => !results[id].assisted).length,
      assisted: correct.filter(({ id }) => results[id].assisted).length,
      total: checks.length,
    }
  }

  return {
    answers, issues, result, answeredCount, busy, xp, canCheck, codeRetrying,
    initialize, reset, accuracyFor, masteryFor, check, retryExercise, skipExercise, skipUnavailable, dontKnow, revealSolution,
  }
}
