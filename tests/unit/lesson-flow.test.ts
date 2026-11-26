import { describe, expect, it } from 'vitest'
import { validateLessonFlow } from '../../src/lib/lesson-flow.ts'
import type { Exercise } from '../../src/domain.ts'

const intro = { outcome: 'Use a function.', relevance: 'Transform values.', focus: 'Arguments and results.' }
function sequence(): Exercise[] {
  return [
    { id: 'learn', type: 'learn', stage: 'learn', prompt: 'Worked example' },
    { id: 'predict', type: 'choice', stage: 'practice', prompt: 'Predict the result', hints: ['Look at the argument'], explanation: 'The function uses this argument.' },
    ...['complete', 'modify'].map((id): Exercise => ({
      id, type: 'code', stage: 'practice', prompt: 'Change one expression', hints: ['Look at the return value'],
      explanation: 'Return the computed value.', starterCode: 'function transform(value) { /* TODO */ }',
      syntax: [{ title: 'Return', code: 'return value', explanation: 'Return sends a value to the caller.' }],
    })),
    { id: 'explain', type: 'open', stage: 'practice', prompt: 'Explain the change', hints: ['Compare input and output'], explanation: 'The expression changes the output.' },
    { id: 'apply', type: 'code', stage: 'check', prompt: 'Apply the same mechanism to a similar task' },
    { id: 'recall', type: 'open', stage: 'check', prompt: 'Explain the mechanism in your own words' },
  ]
}

describe('guided lesson sequence', () => {
  it('accepts productive practice before a similar independent task', () => {
    expect(() => validateLessonFlow('code', intro, sequence())).not.toThrow()
  })

  it('rejects the old jump from one recognition quiz straight into coding', () => {
    const exercises = sequence()
    expect(() => validateLessonFlow('code', intro, [exercises[0], exercises[1], exercises[5]])).toThrow()
  })

  it('requires actual coding practice before independent coding, even with enough quiz steps', () => {
    const exercises = sequence().map((exercise) => exercise.stage === 'practice' && exercise.type === 'code'
      ? { ...exercise, type: 'choice' as const } : exercise)
    expect(() => validateLessonFlow('code', intro, exercises)).toThrow()
  })

  it('requires syntax help for guided code and an ordered progression', () => {
    const exercises = sequence()
    exercises[2].syntax = []
    expect(() => validateLessonFlow('code', intro, exercises)).toThrow()
    const reordered = sequence()
    ;[reordered[1], reordered[5]] = [reordered[5], reordered[1]]
    expect(() => validateLessonFlow('code', intro, reordered)).toThrow()
  })

  it('keeps module assessments separate from the teaching sequence', () => {
    expect(() => validateLessonFlow('test', intro, sequence().filter(({ stage }) => stage === 'check'))).not.toThrow()
    expect(() => validateLessonFlow('test', intro, sequence())).toThrow()
  })

  it.each(['outcome', 'relevance', 'focus'] as const)('requires the introduction field %s', (field) => {
    expect(() => validateLessonFlow('code', { ...intro, [field]: ' ' }, sequence()))
      .toThrow('The model did not generate a complete lesson introduction.')
  })

  it.each([
    { name: 'too many exercises', change: (items: Exercise[]) => { items.push(...items.slice(-3)) } },
    { name: 'no learning card', change: (items: Exercise[]) => { items[0] = { ...items[1] } } },
    { name: 'too many learning cards', change: (items: Exercise[]) => { items.splice(1, 0, { ...items[0] }, { ...items[0] }) } },
    { name: 'too little guided practice', change: (items: Exercise[]) => { items[3].stage = 'check'; items[4].stage = 'check' } },
    { name: 'no independent checks', change: (items: Exercise[]) => { items.splice(5, 2, { ...items[2] }, { ...items[3] }) } },
    { name: 'unknown stage', change: (items: Exercise[]) => { items[1].stage = 'unknown' as Exercise['stage'] } },
    { name: 'a non-learning task in the learn stage', change: (items: Exercise[]) => { items[0].type = 'choice' } },
    { name: 'a learning card outside the learn stage', change: (items: Exercise[]) => { items[1].type = 'learn' } },
    { name: 'only recognition practice', change: (items: Exercise[]) => { items.forEach((item) => { if (item.stage === 'practice') item.type = 'choice' }); items[5].type = 'open' } },
    { name: 'practice without hints', change: (items: Exercise[]) => { items[2].hints = []; items[2].hint = ' ' } },
    { name: 'practice without an explanation', change: (items: Exercise[]) => { items[2].explanation = ' ' } },
    { name: 'coding practice without a syntax example', change: (items: Exercise[]) => { items[2].syntax = [{ title: 'Empty', code: ' ', explanation: 'Empty' }] } },
    { name: 'a non-choice challenge', change: (items: Exercise[]) => { items.push({ id: 'challenge', type: 'open', stage: 'challenge', prompt: 'Explain' }) } },
    { name: 'multiple challenges', change: (items: Exercise[]) => { items.push(...['a', 'b'].map((id): Exercise => ({ id, type: 'choice', stage: 'challenge', prompt: 'Predict' }))) } },
  ])('rejects $name with the existing validation error', ({ change }) => {
    const exercises = sequence()
    change(exercises)
    expect(() => validateLessonFlow('code', intro, exercises))
      .toThrow('The model returned the lesson stages in the wrong order.')
  })

  it('accepts two learning cards, a final optional challenge and the legacy single hint', () => {
    const exercises = sequence()
    exercises.splice(1, 0, { ...exercises[0], id: 'second-example' })
    exercises.push({ id: 'challenge', type: 'choice', stage: 'challenge', prompt: 'One more prediction' })
    exercises[2].hints = []
    exercises[2].hint = 'Look at the argument'
    expect(() => validateLessonFlow('code', intro, exercises)).not.toThrow()
  })

  it('allows design practice without coding and rejects coding tasks in design lessons', () => {
    expect(() => validateLessonFlow('design', intro, sequence())).toThrow()
    const exercises = sequence().map((exercise) => exercise.type === 'code' ? { ...exercise, type: 'open' as const } : exercise)
    expect(() => validateLessonFlow('design', intro, exercises)).not.toThrow()
  })

  it('requires a nonempty assessment of independent tasks, without learning cards', () => {
    expect(() => validateLessonFlow('test', intro, [])).toThrow()
    expect(() => validateLessonFlow('test', intro, [{ ...sequence()[0], stage: 'check' }])).toThrow()
    expect(() => validateLessonFlow('test', intro, [{ ...sequence()[1], stage: 'check' }])).not.toThrow()
  })
})
