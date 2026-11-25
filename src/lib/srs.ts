import { t } from './i18n.ts'
import type { Flashcard, FlashcardText, Rating } from '../domain.ts'
// A simplified spaced repetition scheduler based on SM-2.

const MIN = 60_000
const DAY = 24 * 60 * MIN

export const RATINGS: readonly { id: Rating; label: string; tone: string }[] = [
  { id: 'again', label: 'Again', tone: 'red' },
  { id: 'hard', label: 'Hard', tone: 'yellow' },
  { id: 'good', label: 'Good', tone: 'green' },
  { id: 'easy', label: 'Easy', tone: 'blue' },
]

export function newCard({ front, back, source = '' }: FlashcardText & { source?: string }): Flashcard {
  const created = Date.now()
  return {
    id: Math.random().toString(36).slice(2, 10),
    front,
    back,
    source,
    created,
    due: created,
    interval: 0, // days
    ease: 2.5,
    reps: 0,
    lapses: 0,
  }
}

/** Compute the next review schedule without mutating the card. */
export function schedule(
  card: Pick<Flashcard, 'interval' | 'ease'>,
  rating: Rating,
  now = Date.now(),
): Pick<Flashcard, 'due' | 'interval' | 'ease'> {
  let { interval, ease } = card
  switch (rating) {
    case 'again':
      return { due: now + MIN, interval: 0, ease: Math.max(1.3, ease - 0.2) }
    case 'hard':
      if (interval < 1) return { due: now + 10 * MIN, interval, ease: Math.max(1.3, ease - 0.15) }
      interval = Math.max(1, interval * 1.2)
      return { due: now + interval * DAY, interval, ease: Math.max(1.3, ease - 0.15) }
    case 'good':
      interval = interval < 1 ? 1 : interval * ease
      return { due: now + interval * DAY, interval, ease }
    case 'easy':
    default:
      interval = interval < 1 ? 4 : interval * ease * 1.3
      return { due: now + interval * DAY, interval, ease: ease + 0.15 }
  }
}

export function formatDelay(ms: number) {
  if (ms < 60 * MIN) return `${Math.max(1, Math.round(ms / MIN))} min`
  if (ms < DAY) return t('{0} h', [Math.round(ms / (60 * MIN))])
  const d = Math.round(ms / DAY)
  if (d < 31) return d === 1 ? t('1 day') : t('{0} days', [d])
  return t('{0} mo', [Math.round(d / 30)])
}
