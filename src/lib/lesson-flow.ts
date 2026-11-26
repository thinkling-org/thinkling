import { t } from './i18n.ts'
import type { Exercise, LessonIntro, LessonKind } from '../domain.ts'

export const LESSON_FORMAT = 4

/** Validate the generated teaching sequence before it replaces a cached lesson. */
export function validateLessonFlow(kind: LessonKind, intro: LessonIntro, exercises: Exercise[]) {
  if (![intro?.outcome, intro?.relevance, intro?.focus].every((value) => typeof value === 'string' && value.trim())) {
    throw new Error(t('The model did not generate a complete lesson introduction.'))
  }
  if (kind === 'test') {
    if (exercises.length && exercises.every(({ type, stage }) => type !== 'learn' && stage === 'check')) return
  } else {
    const order = { learn: 0, practice: 1, check: 2, challenge: 3 }
    let previous = -1
    const ordered = exercises.every(({ stage }) => {
      const current = order[stage]
      if (current === undefined || current < previous) return false
      previous = current
      return true
    })
    const practice = exercises.filter(({ stage }) => stage === 'practice')
    const learn = exercises.filter(({ stage }) => stage === 'learn')
    const valid = exercises.length >= 7 && exercises.length <= 9
      && ordered && learn.length >= 1 && learn.length <= 2 && practice.length >= 3
      && exercises.some(({ stage }) => stage === 'check')
      && exercises.filter(({ stage }) => stage === 'challenge').length <= 1
      && exercises.every((exercise) => {
        if (exercise.stage === 'learn') return exercise.type === 'learn'
        if (exercise.type === 'learn') return false
        if (kind === 'design' && exercise.type === 'code') return false
        if (exercise.stage === 'challenge') return exercise.type === 'choice'
        if (exercise.stage !== 'practice') return true
        const hints = exercise.hints?.length ? exercise.hints : [exercise.hint]
        return hints.some((hint) => hint?.trim()) && !!exercise.explanation?.trim()
          && (exercise.type !== 'code' || exercise.syntax?.some((item) => item.code?.trim()))
      })
      && practice.some(({ type }) => type !== 'choice')
      && (!exercises.some(({ stage, type }) => stage === 'check' && type === 'code')
        || practice.filter(({ type }) => type === 'code').length >= 2)
    if (valid) return
  }
  throw new Error(t('The model returned the lesson stages in the wrong order.'))
}
