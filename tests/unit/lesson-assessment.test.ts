import { effectScope, shallowRef } from 'vue'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLessonAssessment } from '../../src/composables/useLessonAssessment.ts'
import { useApp } from '../../src/stores/app.ts'
import type { Exercise, TestRun } from '../../src/domain.ts'

const { grade } = vi.hoisted(() => ({ grade: vi.fn() }))
vi.mock('../../src/lib/api.ts', () => ({ ai: grade, getJSON: vi.fn(), putJSON: vi.fn() }))
vi.mock('../../src/lib/sfx.ts', () => ({ play: vi.fn(), prepareSfx: vi.fn() }))

let pinia: ReturnType<typeof createPinia>
let scope: ReturnType<typeof effectScope>
beforeEach(() => {
  pinia = createPinia(); setActivePinia(pinia); scope = effectScope()
  grade.mockReset()
})
afterEach(() => { scope.stop(); disposePinia(pinia) })

function setup(exercise: Exercise, assisted = false) {
  const current = shallowRef(exercise)
  const run = vi.fn<() => Promise<TestRun>>().mockResolvedValue({ results: [{ name: 'fragment', ok: false }] })
  const solution = vi.fn()
  const assessment = scope.run(() => useLessonAssessment({
    currentExercise: current, title: () => 'Functions', onFeedback: vi.fn(),
    editor: shallowRef({ runnable: true, runAll: run, getFiles: async () => [], showReview: vi.fn() }),
    isAssisted: () => assisted, onSolution: solution,
  }))!
  assessment.initialize([exercise])
  return { assessment, current, run, solution, app: useApp() }
}

describe('practice and independent attempts', () => {
  it('retries verified code practice using immediate test feedback without grades, XP or a model request', async () => {
    const { assessment, run, app } = setup({ id: 'fragment', type: 'code', stage: 'practice', prompt: 'Complete the expression', testsStatus: 'verified' })
    await assessment.check()
    expect(assessment.result.value?.status).toBe('wrong')
    expect(grade).not.toHaveBeenCalled()
    expect(app.stats.history).toHaveLength(0)
    expect(assessment.xp.value).toBe(0)
    assessment.retryExercise()
    expect(assessment.canCheck.value).toBe(true)
    run.mockResolvedValue({ results: [{ name: 'fragment', ok: true }] })
    await assessment.check()
    expect(assessment.result.value?.status).toBe('correct')
    expect(assessment.xp.value).toBe(0)
    expect(app.stats.history).toHaveLength(0)
  })

  it('does not turn a failed explanation during practice into a scored mistake or flashcard', async () => {
    const { assessment, app } = setup({ id: 'explain', type: 'open', stage: 'practice', prompt: 'Why does it work?' })
    grade.mockResolvedValue({ score: 3, verdict: 'wrong', flashcard: { front: 'Gap', back: 'Explanation' } })
    assessment.answers.explain = 'My first explanation'
    await assessment.check()
    expect(assessment.result.value?.status).toBe('wrong')
    expect(app.stats.history).toHaveLength(0)
    expect(app.flashcards).toHaveLength(0)
    assessment.retryExercise()
    expect(assessment.canCheck.value).toBe(true)
  })

  it('distinguishes a correct answer with support from an independent answer without deducting XP', async () => {
    const exercise: Exercise = { id: 'check', type: 'choice', stage: 'check', prompt: 'Predict', options: ['A', 'B'], correctIndex: 0 }
    const { assessment, current, app } = setup(exercise, true)
    assessment.answers.check = 0
    await assessment.check()
    expect(assessment.masteryFor([exercise])).toEqual({ independent: 0, assisted: 1, total: 1 })
    expect(assessment.xp.value).toBe(10)
    expect(app.stats.history).toHaveLength(1)
    current.value = { ...exercise, id: 'practice', stage: 'practice' }
    assessment.revealSolution()
    expect(assessment.result.value).toMatchObject({ solutionRevealed: true, assisted: true })
    expect(assessment.masteryFor([exercise, current.value]).total).toBe(1)
  })

  it('only reveals a practice solution on request and resets earned XP when regenerating', async () => {
    const exercise: Exercise = { id: 'practice', type: 'choice', stage: 'practice', prompt: 'Predict', options: ['A', 'B'], correctIndex: 0 }
    const { assessment, current, solution } = setup(exercise)
    assessment.answers.practice = 1
    await assessment.check()
    expect(assessment.result.value?.solutionRevealed).not.toBe(true)
    assessment.revealSolution()
    expect(solution).toHaveBeenCalledWith('practice')
    expect(assessment.result.value?.solutionRevealed).toBe(true)
    current.value = { ...exercise, stage: 'check', id: 'check' }
    assessment.answers.check = 0
    await assessment.check()
    expect(assessment.masteryFor([current.value])).toEqual({ independent: 1, assisted: 0, total: 1 })
    assessment.reset([exercise])
    expect(assessment.xp.value).toBe(0)
    expect(assessment.result.value).toBeUndefined()
  })
})
