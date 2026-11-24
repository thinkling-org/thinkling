import type { Exercise, LessonKind } from '../domain.ts'

const PACES: { label: string; plan: string; select: (exercises: Exercise[]) => Exercise[] }[] = [
  {
    label: 'I\'m new to this',
    plan: 'Start with the basics and examples at a comfortable pace.',
    select: (exercises) => exercises,
  },
  {
    label: 'I\'ve seen this before',
    plan: 'One refresher card, then straight to exercises.',
    select: (exercises) => {
      const firstCard = exercises.findIndex((exercise) => exercise.stage === 'learn')
      return exercises.filter((exercise, index) => exercise.stage !== 'learn' || index === firstCard)
    },
  },
  {
    label: 'I know this and want a review',
    plan: 'Skip to the knowledge checks. See an explanation after each answer.',
    select: (exercises) => exercises.filter((exercise) => exercise.stage === 'check' || exercise.stage === 'challenge'),
  },
]

const MINUTES_BY_EXERCISE = { learn: 2, choice: 1, open: 2, code: 5 }

export function getLessonPaces(exercises: Exercise[], kind?: LessonKind) {
  if (kind === 'test') return []
  return PACES.map(({ label, plan, select }) => ({ label, plan, exercises: select(exercises) }))
    .filter((pace, index) => index === 0 || pace.exercises.length)
}

export function estimateLesson(exercises: Exercise[], completed: boolean) {
  const minutes = exercises.reduce((sum, exercise) => sum + (MINUTES_BY_EXERCISE[exercise.type] || 1), 0)
  const graded = exercises.filter((exercise) => exercise.stage === 'check')
  const xp = graded.reduce((sum, exercise) => sum + (exercise.type === 'code' ? 20 : 10), 0)
  return { minutes: Math.max(1, minutes), count: exercises.length, xp: xp + (completed ? 5 : 20) }
}
