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
})
