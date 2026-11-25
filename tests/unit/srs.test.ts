import { describe, expect, it, vi } from 'vitest'
import type { Rating } from '../../src/domain.ts'
import { configureLocale } from '../../src/lib/i18n.ts'
import { formatDelay, newCard, schedule } from '../../src/lib/srs.ts'

const reviewTime = Date.parse('2026-01-01T12:00:00Z')

describe('newCard', () => {
  it('makes a newly created card due immediately', () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValueOnce(reviewTime).mockReturnValue(reviewTime + 1)

    try {
      expect(newCard({ front: 'What is a closure?', back: 'A function with access to its lexical scope.' })).toEqual({
        id: expect.stringMatching(/^[a-z0-9]+$/),
        front: 'What is a closure?',
        back: 'A function with access to its lexical scope.',
        source: '',
        created: reviewTime,
        due: reviewTime,
        interval: 0,
        ease: 2.5,
        reps: 0,
        lapses: 0,
      })
    } finally {
      clock.mockRestore()
    }
  })

  it('keeps the source supplied by the lesson', () => {
    expect(newCard({ front: 'When is a variable in scope?', back: 'Inside its scope.', source: 'lesson: Scope' }).source)
      .toBe('lesson: Scope')
  })
})

describe('schedule', () => {
  it('resets the interval after a missed review without dropping ease below 1.3', () => {
    const card = Object.freeze({ interval: 8, ease: 1.4 })

    expect(schedule(card, 'again', reviewTime)).toEqual({
      due: Date.parse('2026-01-01T12:01:00Z'),
      interval: 0,
      ease: 1.3,
    })
  })

  it.each<{
    rating: Rating
    previousInterval: number
    previousEase: number
    nextReview: string
    nextInterval: number
    nextEase: number
  }>([
    {
      rating: 'hard',
      previousInterval: 0,
      previousEase: 2.5,
      nextReview: '2026-01-01T12:10:00Z',
      nextInterval: 0,
      nextEase: 2.35,
    },
    {
      rating: 'hard',
      previousInterval: 5,
      previousEase: 1.4,
      nextReview: '2026-01-07T12:00:00Z',
      nextInterval: 6,
      nextEase: 1.3,
    },
    {
      rating: 'good',
      previousInterval: 0,
      previousEase: 2.5,
      nextReview: '2026-01-02T12:00:00Z',
      nextInterval: 1,
      nextEase: 2.5,
    },
    {
      rating: 'good',
      previousInterval: 4,
      previousEase: 2.5,
      nextReview: '2026-01-11T12:00:00Z',
      nextInterval: 10,
      nextEase: 2.5,
    },
    {
      rating: 'easy',
      previousInterval: 0,
      previousEase: 2.5,
      nextReview: '2026-01-05T12:00:00Z',
      nextInterval: 4,
      nextEase: 2.65,
    },
    {
      rating: 'easy',
      previousInterval: 4,
      previousEase: 2.5,
      nextReview: '2026-01-14T12:00:00Z',
      nextInterval: 13,
      nextEase: 2.65,
    },
  ])('schedules a $rating review after a $previousInterval-day interval', ({
    rating, previousInterval, previousEase, nextReview, nextInterval, nextEase,
  }) => {
    const card = Object.freeze({ interval: previousInterval, ease: previousEase })

    expect(schedule(card, rating, reviewTime)).toEqual({
      due: Date.parse(nextReview),
      interval: nextInterval,
      ease: nextEase,
    })
  })

  it('uses the current time when no review time is provided', () => {
    vi.useFakeTimers({ toFake: ['Date'] })

    try {
      vi.setSystemTime(reviewTime)

      expect(schedule({ interval: 8, ease: 2.5 }, 'again')).toEqual({
        due: Date.parse('2026-01-01T12:01:00Z'),
        interval: 0,
        ease: 2.3,
      })
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('formatDelay', () => {
  it.each([
    { milliseconds: 0, label: '1 min' },
    { milliseconds: 90_000, label: '2 min' },
    { milliseconds: 5_400_000, label: '2 h' },
    { milliseconds: 86_400_000, label: '1 day' },
    { milliseconds: 2_592_000_000, label: '30 days' },
    { milliseconds: 2_678_400_000, label: '1 mo' },
  ])('displays $milliseconds ms as $label', ({ milliseconds, label }) => {
    expect(formatDelay(milliseconds)).toBe(label)
  })

  it('translates the review interval into the interface language', () => {
    configureLocale(() => 'pl-PL')
    try {
      expect(formatDelay(172_800_000)).toBe('2 dni')
    } finally {
      configureLocale(() => 'en')
    }
  })
})
