import { t } from '../lib/i18n.js'
import { computed, reactive, shallowRef, watch } from 'vue'
import { useApp } from '../stores/app.js'
import { ai } from '../lib/api.js'
import { allTestsPassed } from '../lib/runner.js'
import { play, prepareSfx } from '../lib/sfx.js'

export function useLessonAssessment({ currentExercise, title, editor, onFeedback }) {
  const app = useApp()
  const answers = reactive({})
  const results = reactive({})
  const issues = reactive({})
  const busy = shallowRef(false)
  const xp = shallowRef(0)
  const result = computed(() => currentExercise.value ? results[currentExercise.value.id] : null)
  const answeredCount = computed(() => Object.keys(results).length)

  function initialize(exercises) {
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

  function checkChoice(exercise) {
    if (exercise.stage === 'practice') return revealPractice(exercise, true)
    const ok = answers[exercise.id] === exercise.correctIndex
    results[exercise.id] = { status: ok ? 'correct' : 'wrong' }
    onFeedback('.explain')
    if (exercise.stage === 'challenge') return
    if (exercise.warmup) {
      // rozgrzewka przed kartą wiedzy — bez kary, bez fiszki
      xp.value += ok ? 5 : 2
      return
    }
    app.recordAnswer({ score: ok ? 1 : 0 })
    if (ok) xp.value += 10
    else {
      const front = `${exercise.prompt}${exercise.code ? `\n\n\`\`\`${exercise.codeLanguage || ''}\n${exercise.code}\n\`\`\`` : ''}`
      app.addFlashcards([{ front, back: `**${exercise.options[exercise.correctIndex]}**\n\n${exercise.explanation}` }], t('błąd w lekcji: {0}', [title()]))
    }
  }

  function revealPractice(exercise, submitted = false) {
    play(submitted ? (answers[exercise.id] === exercise.correctIndex ? 'correct' : 'almost') : 'pop')
    results[exercise.id] = { status: 'practice' }
    onFeedback('.explain')
  }

  async function checkOpen(exercise) {
    busy.value = true
    try {
      const data = await ai('gradeOpen', { exercise, answer: answers[exercise.id], level: app.plan?.level })
      const status = data.verdict || (data.score >= 8 ? 'correct' : data.score >= 5 ? 'almost' : 'wrong')
      results[exercise.id] = { status, data }
      app.recordAnswer({ score: (data.score || 0) / 10, weakSpot: data.weakSpot })
      xp.value += Math.max(1, data.score || 0)
      if (data.flashcard?.front) app.addFlashcards([data.flashcard], t('z błędu w lekcji: {0}', [title()]))
    } catch (err) {
      results[exercise.id] = { status: 'error', error: err.message }
    } finally {
      busy.value = false
    }
  }

  async function checkCode(exercise) {
    busy.value = true
    try {
      let run = null
      if (editor.value?.runnable) run = await editor.value.runAll()
      editor.value?.showReview()
      const payload = { exercise, testResults: run, level: app.plan?.level }
      if (exercise.runtime === 'docker') payload.files = await editor.value.getFiles()
      else payload.code = answers[exercise.id]
      const data = await ai('reviewCode', payload)
      // przy niezweryfikowanych testach decyduje review modelu
      const testsOk = !run || allTestsPassed(run) || exercise.testsStatus === 'unverified'
      const status = data.passed && testsOk ? 'correct' : data.score >= 5 ? 'almost' : 'wrong'
      const prev = results[exercise.id]?.status
      results[exercise.id] = { status, data }
      issues[exercise.id] = data.issues || []
      if (!prev || prev === 'error') {
        app.recordAnswer({ score: (data.score || 0) / 10, weakSpot: data.weakSpot })
        xp.value += status === 'correct' ? 20 : status === 'almost' ? 10 : 3
        if (data.flashcard?.front) app.addFlashcards([data.flashcard], t('z zadania: {0}', [exercise.title]))
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

  /** Pytanie otwarte: uczciwe "nie wiem" — pokazujemy wzorcową odpowiedź i dodajemy ją do fiszek. */
  function dontKnow() {
    const exercise = currentExercise.value
    results[exercise.id] = { status: 'unknown' }
    app.recordAnswer({ score: 0 })
    app.addFlashcards([{ front: exercise.prompt, back: exercise.referenceAnswer }], t('„nie wiem” w lekcji: {0}', [title()]))
    onFeedback('.feedback')
  }

  function reset(exercises) {
    for (const state of [answers, results, issues]) {
      for (const key of Object.keys(state)) delete state[key]
    }
    initialize(exercises)
  }

  function accuracyFor(exercises) {
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
