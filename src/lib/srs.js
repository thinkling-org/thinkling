import { t } from './i18n.js'
// Uproszczone powtórki rozłożone w czasie (w duchu SM-2).

const MIN = 60_000
const DAY = 24 * 60 * MIN

export const RATINGS = [
  { id: 'again', label: 'Znowu', tone: 'red' },
  { id: 'hard', label: 'Trudne', tone: 'yellow' },
  { id: 'good', label: 'Dobrze', tone: 'green' },
  { id: 'easy', label: 'Łatwe', tone: 'blue' },
]

export function newCard({ front, back, source = '' }) {
  return {
    id: Math.random().toString(36).slice(2, 10),
    front,
    back,
    source,
    created: Date.now(),
    due: Date.now(),
    interval: 0, // dni
    ease: 2.5,
    reps: 0,
    lapses: 0,
  }
}

/** Zwraca { due, interval, ease } po ocenie — bez mutacji. */
export function schedule(card, rating, now = Date.now()) {
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

export function formatDelay(ms) {
  if (ms < 60 * MIN) return `${Math.max(1, Math.round(ms / MIN))} min`
  if (ms < DAY) return t('{0} godz.', [Math.round(ms / (60 * MIN))])
  const d = Math.round(ms / DAY)
  if (d < 31) return d === 1 ? t('1 dzień') : t('{0} dni', [d])
  return t('{0} mies.', [Math.round(d / 30)])
}
