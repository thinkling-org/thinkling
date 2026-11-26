import { effectScope, shallowRef } from 'vue'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLessonSession } from '../../src/composables/useLessonSession.ts'
import { useApp } from '../../src/stores/app.ts'
import { LESSON_FORMAT } from '../../src/lib/lesson-flow.ts'
import type { CachedLesson, Exercise } from '../../src/domain.ts'

let pinia: ReturnType<typeof createPinia>
let scope: ReturnType<typeof effectScope>
let app: ReturnType<typeof useApp>
const exercises: Exercise[] = [
  { id: 'learn', type: 'learn', stage: 'learn', prompt: 'Example' },
  { id: 'check', type: 'choice', stage: 'check', prompt: 'Predict', options: ['A', 'B'], correctIndex: 0 },
]
const lesson: CachedLesson = { format: LESSON_FORMAT, intro: { summary: 'Learn functions' }, exercises, flashcards: [], generatedAt: 1 }

beforeEach(() => {
  vi.useFakeTimers()
  pinia = createPinia(); setActivePinia(pinia); scope = effectScope(); app = useApp()
  vi.spyOn(app, 'ensureLesson').mockImplementation(async (id) => { app.lessons[id] = structuredClone(lesson); return app.lessons[id] })
  vi.spyOn(app, 'regenerateLesson').mockImplementation(async (id) => { app.lessons[id] = structuredClone(lesson); return app.lessons[id] })
  vi.spyOn(app, 'completeLesson').mockReturnValue(20)
  vi.spyOn(app, 'addTime')
})
afterEach(() => { scope.stop(); disposePinia(pinia); vi.restoreAllMocks(); vi.clearAllTimers(); vi.useRealTimers() })
const setup = () => scope.run(() => useLessonSession(shallowRef('lesson')))!

describe('lesson session lifecycle', () => {
  it('loads the lesson and initializes assessment before showing the intro', async () => {
    const session = setup()
    const initialize = vi.fn()
    expect(session.phase.value).toBe('loading')
    expect(session.exercise.value).toBeUndefined()
    await session.load(initialize)
    expect(initialize).toHaveBeenCalledWith(exercises)
    expect(session.phase.value).toBe('intro')
    expect(session.intro.value.summary).toBe('Learn functions')
    expect(session.exercises.value).toEqual(exercises)
    session.level.value = 2
    expect(session.exercise.value.id).toBe('check')
    expect(session.estimate.value).toEqual({ minutes: 1, count: 1, xp: 30 })
  })

  it('shows a load failure and clears it on a successful retry', async () => {
    vi.mocked(app.ensureLesson).mockRejectedValueOnce(new Error('Provider offline'))
    const session = setup()
    await session.load(vi.fn())
    expect(session.phase.value).toBe('error')
    expect(session.loadError.value).toBe('Provider offline')
    await session.load(vi.fn())
    expect(session.phase.value).toBe('intro')
    expect(session.loadError.value).toBe('')
  })

  it('resets selected pace and exercise after regeneration', async () => {
    const session = setup()
    await session.load(vi.fn())
    session.level.value = 1
    session.exerciseIndex.value = 1
    const reset = vi.fn()
    await session.regenerate(reset)
    expect(session.level.value).toBe(0)
    expect(session.exerciseIndex.value).toBe(0)
    expect(reset).toHaveBeenCalledWith(exercises)
  })

  it('records completion, bonus XP and elapsed time only once', () => {
    const session = setup()
    vi.setSystemTime(Date.now() + 65_000)
    const mastery = { independent: 1, assisted: 0, total: 1 }
    session.finish(10, 100, mastery)
    expect(app.completeLesson).toHaveBeenCalledWith('lesson', { xp: 10 })
    expect(session.summary.value).toEqual({ accuracy: 100, xp: 30, elapsed: '1:05', mastery })
    expect(session.phase.value).toBe('summary')
    session.commitTime()
    expect(app.addTime).toHaveBeenCalledExactlyOnceWith(65)
  })

  it('caps recorded lesson time at three hours', () => {
    const session = setup()
    vi.setSystemTime(Date.now() + 4 * 60 * 60_000)
    session.commitTime()
    expect(app.addTime).toHaveBeenCalledWith(10_800)
  })

  it.each([true, false])('ignores a late load result after disposal (success: %s)', async (success) => {
    let resolve!: (lesson: CachedLesson) => void
    let reject!: (error: Error) => void
    vi.mocked(app.ensureLesson).mockReturnValueOnce(new Promise((yes, no) => { resolve = yes; reject = no }))
    const session = setup()
    const initialize = vi.fn()
    const pending = session.load(initialize)
    scope.stop()
    if (success) resolve(lesson)
    else reject(new Error('Late error'))
    await pending
    expect(initialize).not.toHaveBeenCalled()
    expect(session.phase.value).toBe('loading')
    expect(session.loadError.value).toBe('')
  })
})
