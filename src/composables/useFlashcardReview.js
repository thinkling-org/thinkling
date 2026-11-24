import { computed, onBeforeUnmount, shallowRef } from 'vue'
import { play } from '../lib/sfx.js'
import { formatDelay, RATINGS, schedule } from '../lib/srs.js'
import { useApp } from '../stores/app.js'

const SESSION_LIMIT = 30
const MAX_REVIEW_SECONDS = 60 * 60
const RATING_SOUNDS = {
  again: ['pop', 0.7],
  hard: ['almost'],
  good: ['correct'],
  easy: ['correct'],
}

export function useFlashcardReview({ reviewAll }) {
  const app = useApp()
  const startedAt = Date.now()
  const deck = reviewAll ? app.flashcards : app.dueCards
  const queue = shallowRef([...deck]
    .sort((a, b) => a.due - b.due)
    .slice(0, SESSION_LIMIT)
    .map((card) => card.id))
  const total = queue.value.length
  const doneCount = shallowRef(0)
  const revealed = shallowRef(false)
  const stats = shallowRef(Object.fromEntries(RATINGS.map(({ id }) => [id, 0])))
  const card = computed(() => app.flashcards.find((item) => item.id === queue.value[0]))
  const finished = computed(() => !queue.value.length)
  const previews = computed(() => {
    if (!card.value) return {}
    const now = Date.now()
    return Object.fromEntries(RATINGS.map(({ id }) => [id, formatDelay(schedule(card.value, id, now).due - now)]))
  })

  function rate(rating) {
    if (!card.value || !revealed.value || !Object.hasOwn(RATING_SOUNDS, rating)) return
    const { id } = card.value
    const remaining = queue.value.slice(1)
    play(...RATING_SOUNDS[rating])
    if (!remaining.length && rating !== 'again') setTimeout(() => play('complete'), 350)
    app.rateCard(id, rating)
    stats.value = { ...stats.value, [rating]: stats.value[rating] + 1 }
    if (rating === 'again') remaining.push(id)
    else doneCount.value++
    queue.value = remaining
    revealed.value = false
  }

  onBeforeUnmount(() => {
    if (doneCount.value) app.addTime(Math.min((Date.now() - startedAt) / 1000, MAX_REVIEW_SECONDS))
  })

  return { total, doneCount, revealed, stats, card, finished, previews, rate }
}
