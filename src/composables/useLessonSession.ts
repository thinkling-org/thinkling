import { computed, onScopeDispose, shallowRef } from 'vue'
import type { Ref } from 'vue'
import { estimateLesson, getLessonPaces } from '../lib/lesson-options.ts'
import { useApp } from '../stores/app.ts'
import type { CachedLesson, Exercise } from '../domain.ts'

const MAX_LESSON_SECONDS = 3 * 60 * 60

type Phase = 'loading' | 'error' | 'intro' | 'play' | 'summary'
type ExerciseSetup = (exercises: Exercise[]) => void

export function useLessonSession(lessonId: Readonly<Ref<string>>) {
  const app = useApp()
  const startedAt = Date.now()
  let timeCommitted = false
  let disposed = false

  const phase = shallowRef<Phase>('loading')
  const loadError = shallowRef('')
  const level = shallowRef(0)
  const exerciseIndex = shallowRef(0)
  const summary = shallowRef<{ accuracy: number; xp: number; elapsed: string } | null>(null)
  const meta = computed(() => app.findLesson(lessonId.value))
  const lesson = computed(() => app.lessons[lessonId.value])
  const intro = computed(() => lesson.value?.intro)
  const gen = computed(() => app.lessonGen[lessonId.value])
  const allExercises = computed(() => lesson.value?.exercises || [])
  const levels = computed(() => getLessonPaces(allExercises.value, meta.value?.kind))
  const exercises = computed(() => levels.value[level.value]?.exercises || allExercises.value)
  const exercise = computed(() => exercises.value[exerciseIndex.value])
  const estimate = computed(() => estimateLesson(exercises.value, meta.value?.status === 'done'))

  async function prepare(fetchLesson: (id: string) => Promise<CachedLesson>, onReady: ExerciseSetup) {
    phase.value = 'loading'
    loadError.value = ''
    try {
      await fetchLesson(lessonId.value)
      if (disposed) return
      onReady(allExercises.value)
      phase.value = 'intro'
    } catch (error) {
      if (disposed) return
      loadError.value = error.message
      phase.value = 'error'
    }
  }

  function load(initialize: ExerciseSetup) {
    return prepare(app.ensureLesson, initialize)
  }

  function regenerate(reset: ExerciseSetup) {
    return prepare(app.regenerateLesson, (loadedExercises) => {
      exerciseIndex.value = 0
      level.value = 0
      reset(loadedExercises)
    })
  }

  function elapsedSeconds() {
    return (Date.now() - startedAt) / 1000
  }

  function commitTime() {
    if (timeCommitted) return
    timeCommitted = true
    app.addTime(Math.min(elapsedSeconds(), MAX_LESSON_SECONDS))
  }

  function finish(xp: number, accuracy: number) {
    const bonus = app.completeLesson(lessonId.value, { xp }) || 0
    commitTime()
    const seconds = Math.round(elapsedSeconds())
    summary.value = {
      accuracy,
      xp: xp + bonus,
      elapsed: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`,
    }
    phase.value = 'summary'
  }

  onScopeDispose(() => { disposed = true })

  return {
    phase, loadError, level, levels, exerciseIndex, meta, intro, gen, exercises, exercise, estimate, summary,
    load, regenerate, finish, commitTime,
  }
}
