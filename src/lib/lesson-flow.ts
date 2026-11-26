import { t } from './i18n.ts'
import type { Exercise, ExerciseStage, LessonIntro, LessonKind } from '../domain.ts'

export const LESSON_FORMAT = 4

const STAGE_ORDER: Record<ExerciseStage, number> = { learn: 0, practice: 1, check: 2, challenge: 3 }

/** Validate the generated teaching sequence before it replaces a cached lesson. */
export function validateLessonFlow(kind: LessonKind, intro: LessonIntro, exercises: Exercise[]): void {
  if (![intro?.outcome, intro?.relevance, intro?.focus].every((value) => typeof value === 'string' && value.trim())) {
    throw new Error(t('The model did not generate a complete lesson introduction.'))
  }

  const valid = kind === 'test'
    ? exercises.length > 0 && exercises.every(({ type, stage }) => type !== 'learn' && stage === 'check')
    : isValidGuidedLesson(kind, exercises)

  if (!valid) throw new Error(t('The model returned the lesson stages in the wrong order.'))
}

function isValidGuidedLesson(kind: LessonKind, exercises: Exercise[]): boolean {
  const learningCards = exercises.filter(({ stage }) => stage === 'learn')
  const practice = exercises.filter(({ stage }) => stage === 'practice')
  const checks = exercises.filter(({ stage }) => stage === 'check')
  const challenges = exercises.filter(({ stage }) => stage === 'challenge')

  const hasValidLength = exercises.length >= 7 && exercises.length <= 9
  const hasRequiredStages = learningCards.length >= 1 && learningCards.length <= 2
    && practice.length >= 3 && checks.length > 0 && challenges.length <= 1
  const hasProductivePractice = practice.some(({ type }) => type !== 'choice')
  // Independent coding needs repeated coding practice, not just recognition quizzes.
  const hasCodingPreparation = !checks.some(({ type }) => type === 'code')
    || practice.filter(({ type }) => type === 'code').length >= 2

  return hasValidLength && hasRequiredStages && hasProductivePractice && hasCodingPreparation
    && hasValidStageOrder(exercises)
    && exercises.every((exercise) => hasValidExerciseContent(kind, exercise))
}

function hasValidStageOrder(exercises: Exercise[]): boolean {
  let previous = -1
  for (const { stage } of exercises) {
    const current = STAGE_ORDER[stage]
    if (current === undefined || current < previous) return false
    previous = current
  }
  return true
}

function hasValidExerciseContent(kind: LessonKind, exercise: Exercise): boolean {
  if (exercise.stage === 'learn') return exercise.type === 'learn'
  if (exercise.type === 'learn') return false
  if (kind === 'design' && exercise.type === 'code') return false
  if (exercise.stage === 'challenge') return exercise.type === 'choice'
  if (exercise.stage !== 'practice') return true

  const hints = exercise.hints?.length ? exercise.hints : [exercise.hint]
  const hasExplanation = !!exercise.explanation?.trim()
  const hasSyntaxExample = exercise.type !== 'code' || !!exercise.syntax?.some((item) => item.code?.trim())
  return hints.some((hint) => hint?.trim()) && hasExplanation && hasSyntaxExample
}
