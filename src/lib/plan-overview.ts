import { t } from './i18n.ts'
import { LESSON_KINDS } from './lesson-kinds.ts'
import type { LessonDescription, LessonKind, PlanPreview } from '../domain.ts'

export function summarizeModule(module: { lessons?: LessonDescription[] }) {
  const lessons = module.lessons || []
  const counts = new Map<LessonKind, number>()
  for (const lesson of lessons) {
    if (lesson?.kind) counts.set(lesson.kind, (counts.get(lesson.kind) || 0) + 1)
  }
  const kinds = Array.from(counts, ([kind, count]) =>
    kind === 'code' ? t('{0} × exercises', [count]) : t(LESSON_KINDS[kind]?.summary || kind),
  )
  return [t('{0} lessons', [lessons.length]), ...kinds].join(' · ')
}

export function describePlanProgress({ partial, status }: { partial?: PlanPreview | null; status: string }) {
  const { goal, level, levelSummary, modules } = partial || {}
  const moduleCount = (modules || []).filter((module) => module?.title).length
  const analyzed = !!(goal || level)
  const modulesStarted = moduleCount > 0
  const done = status === 'done'
  return [
    {
      title: t('Analyzing your description'),
      sub: goal ? t('Goal: {0}', [goal]) : t('Reading what you want to learn'),
      state: analyzed || done ? 'done' : 'active',
    },
    {
      title: t('Assessing your level'),
      sub: level ? [level, levelSummary].filter(Boolean).join(' · ') : t('Finding gaps'),
      state: modulesStarted || done ? 'done' : analyzed ? 'active' : 'todo',
    },
    {
      title: t('Building modules'),
      sub: modulesStarted ? t('{0} ready', [moduleCount]) : t('Queued'),
      state: done ? 'done' : modulesStarted ? 'active' : 'todo',
    },
    {
      title: t('First lesson and flashcards'),
      sub: done ? t('Ready') : t('Queued'),
      state: done ? 'done' : 'todo',
    },
  ]
}
