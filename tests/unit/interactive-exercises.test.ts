import { effectScope, shallowRef } from 'vue'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLessonAssessment } from '../../src/composables/useLessonAssessment.ts'
import { useApp } from '../../src/stores/app.ts'
import { blockDefinition, gradeInteraction, readInteraction } from '../../src/blocks/registry.ts'
import { installedBlocks } from '../../src/blocks/installed.ts'
import { lessonTask } from '../../server/prompts.ts'
import { validateLessonFlow } from '../../src/lib/lesson-flow.ts'
import type { Exercise, LessonKind, Plan } from '../../src/domain.ts'

const { ai } = vi.hoisted(() => ({ ai: vi.fn() }))
vi.mock('../../src/lib/api.ts', () => ({ ai, getJSON: vi.fn(), putJSON: vi.fn() }))
vi.mock('../../src/lib/sfx.ts', () => ({ play: vi.fn(), prepareSfx: vi.fn() }))

const steps = ['Read the input', 'Validate it', 'Save it', 'Reply'].map((text) => ({ text, indent: 0 }))
const ordering = (stage: Exercise['stage'], extra: Partial<Exercise> = {}): Exercise => ({
  id: `order-${stage}`, type: 'interactive', stage, prompt: 'Put the request steps in order.',
  explanation: 'Validate before saving.', hints: ['What must happen before saving?'],
  interaction: { type: 'step-ordering', blockVersion: '1.1.0', steps },
  ...extra,
})

let pinia: ReturnType<typeof createPinia>
let scope: ReturnType<typeof effectScope>
beforeEach(() => {
  pinia = createPinia(); setActivePinia(pinia); scope = effectScope()
  ai.mockReset()
  installedBlocks.clear()
})
afterEach(() => { scope.stop(); disposePinia(pinia) })

function setup(exercise: Exercise) {
  const current = shallowRef(exercise)
  const assessment = scope.run(() => useLessonAssessment({
    currentExercise: current, title: () => 'Requests', onFeedback: vi.fn(),
    editor: shallowRef(null), isAssisted: () => false,
  }))!
  assessment.initialize([exercise])
  return { assessment, app: useApp() }
}

describe('step-ordering as an exercise', () => {
  const data = () => readInteraction(ordering('check'))

  it('accepts task data without an instruction of its own', () => {
    expect(data()).toMatchObject({ type: 'step-ordering', instruction: '', steps })
    // The same data is still rejected as a visualization, which needs an instruction.
    expect(blockDefinition('step-ordering').normalize({ steps }, { version: '1.1.0' })).toBeNull()
  })

  it('grades the order: all right, mostly right, or wrong', () => {
    const grade = (answer: unknown) => gradeInteraction(ordering('check'), answer)
    expect(grade([0, 1, 2, 3])).toEqual({ verdict: 'correct', score: 1 })
    expect(grade([0, 1, 3, 2])).toEqual({ verdict: 'wrong', score: 0.5, feedback: '2 of 4 steps are in the right position.' })
    expect(grade([0, 2, 1, 3]).verdict).toBe('wrong')
    expect(grade([1, 0, 2, 3])).toMatchObject({ verdict: 'wrong', score: 0.5 })
    expect(grade([0, 0, 1, 2])).toMatchObject({ verdict: 'wrong', score: 0 })
    expect(grade('nonsense')).toMatchObject({ verdict: 'wrong', score: 0 })
  })

  it('gives "almost" when most steps are right', () => {
    const five = ordering('check', { interaction: { type: 'step-ordering', steps: [...steps, { text: 'Log it', indent: 0 }] } })
    expect(gradeInteraction(five, [0, 1, 2, 4, 3])).toMatchObject({ verdict: 'almost', score: 0.6 })
  })

  it('refuses to grade when the block is unavailable or returns nonsense', () => {
    expect(() => gradeInteraction(ordering('check', { interaction: { type: 'math/missing' } }), [0])).toThrow('no block can grade')
    installedBlocks.set('test/liar', {
      id: 'test/liar', version: '1.0.0', engine: '^1.1.0', summary: '', schema: {}, instructions: '',
      normalize: (d) => d, describe: () => '', mount: () => ({ update() {}, unmount() {} }),
      grade: () => ({ verdict: 'perfect', score: 2 }) as never,
    })
    expect(() => gradeInteraction(ordering('check', { interaction: { type: 'test/liar' } }), 1)).toThrow('invalid grade')
  })
})

describe('grading interactive exercises in a lesson', () => {
  it('scores a check locally, without a model request, and adds a flashcard for a mistake', async () => {
    const { assessment, app } = setup(ordering('check'))
    expect(assessment.canCheck.value).toBe(false)
    assessment.answers['order-check'] = [0, 1, 3, 2]
    expect(assessment.canCheck.value).toBe(true)
    await assessment.check()
    expect(ai).not.toHaveBeenCalled()
    expect(assessment.result.value).toMatchObject({ status: 'wrong', data: { score: 5, feedback: '2 of 4 steps are in the right position.' } })
    expect(app.stats.history.map((h) => h.score)).toEqual([0.5])
    expect(app.flashcards).toEqual([expect.objectContaining({ front: 'Put the request steps in order.', back: 'Validate before saving.' })])
  })

  it('gives XP for a correct check and nothing scored for practice', async () => {
    const check = setup(ordering('check'))
    check.assessment.answers['order-check'] = [0, 1, 2, 3]
    await check.assessment.check()
    expect(check.assessment.xp.value).toBe(10)

    // Both setups share the store, so compare against what the check already recorded.
    const practice = setup(ordering('practice'))
    const recorded = practice.app.stats.history.length
    practice.assessment.answers['order-practice'] = [3, 2, 1, 0]
    await practice.assessment.check()
    expect(practice.assessment.result.value.status).toBe('wrong')
    expect(practice.app.stats.history).toHaveLength(recorded)
    expect(practice.app.flashcards).toHaveLength(0)
    expect(practice.assessment.xp.value).toBe(0)
    practice.assessment.retryExercise()
    expect(practice.assessment.result.value).toBeUndefined()
  })

  it('leaves exercises without their extension out of accuracy and mastery', () => {
    const exercise = ordering('check', { interaction: { type: 'math/missing' } })
    const { assessment, app } = setup(exercise)
    assessment.skipUnavailable()
    expect(assessment.result.value).toEqual({ status: 'skipped', unavailable: true })
    expect(app.stats.history).toHaveLength(0)
    expect(assessment.accuracyFor([exercise])).toBe(100)
    expect(assessment.masteryFor([exercise]).total).toBe(0)
  })
})

describe('interactive exercises in prompts and lesson flow', () => {
  const profile = { description: 'Developer', minutesPerDay: 20, style: 'balanced' as const }
  const plan = (kind: LessonKind, blocks: string[]): Plan => ({
    title: 'Plan', summary: '', goal: '', level: 'Mid', levelSummary: '', language: 'javascript', durationWeeks: 1, weakSpots: [], createdAt: 0,
    modules: [{ id: 'm0', title: 'M', week: 1, description: '', lessons: [{ id: 'l0', title: 'L', kind, focus: '', status: 'current', blocks }] }],
  })
  const task = (blocks: string[]) => lessonTask({ profile, plan: plan('mixed', blocks), moduleIndex: 0, lessonIndex: 0, runtime: 'browser' })
  const exerciseItem = (t) => t.schema.properties.exercises.items

  it('offers "interactive" only when a chosen block can be an exercise', () => {
    const withOrdering = task(['step-ordering'])
    expect(exerciseItem(withOrdering).properties.type.enum).toContain('interactive')
    expect(exerciseItem(withOrdering).properties.interaction.anyOf.map((s) => s.type === 'null' ? null : s.properties.type.enum[0])).toEqual([null, 'step-ordering'])
    expect(withOrdering.prompt).toContain('- "interactive": the learner does the task inside a block')
    expect(withOrdering.prompt).toContain('  - "step-ordering": the learner puts the steps')
    expect(withOrdering.prompt).toContain('Include at least one productive task ("open", "code" or "interactive")')

    const withTrace = task(['step-trace'])
    expect(exerciseItem(withTrace).properties.type.enum).not.toContain('interactive')
    expect(exerciseItem(withTrace).properties.interaction).toBeUndefined()
    expect(withTrace.prompt).not.toContain('"interactive"')
  })

  it('accepts interactive exercises as productive practice and as checks', () => {
    const intro = { outcome: 'o', relevance: 'r', focus: 'f' }
    const learn: Exercise = { id: 'l', type: 'learn', stage: 'learn', prompt: 'Card' }
    const choice = (id: string): Exercise => ({ id, type: 'choice', stage: 'practice', prompt: 'Q', explanation: 'E', hints: ['H'] })
    const exercises = [learn, choice('a'), choice('b'), { ...ordering('practice'), id: 'c' }, { ...ordering('practice'), id: 'd' }, choice('e'), ordering('check')]
    expect(() => validateLessonFlow('mixed', intro, exercises)).not.toThrow()
  })
})
