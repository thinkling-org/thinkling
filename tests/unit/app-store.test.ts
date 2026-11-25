import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, disposePinia } from 'pinia'
import { nextTick } from 'vue'
import type { CachedLesson, LessonContent, PlanDescription, Profile } from '../../src/domain.ts'
import { useApp } from '../../src/stores/app.ts'

const fetchResponse = vi.fn<typeof fetch>()
const profile: Profile = { description: 'Learn asynchronous JavaScript', minutesPerDay: 20, style: 'code' }
const planDescription: PlanDescription = {
  title: 'Asynchronous JavaScript',
  summary: 'Learn to work with promises.',
  goal: 'Handle asynchronous results and errors.',
  level: 'Junior',
  levelSummary: 'New to promises.',
  language: 'javascript',
  durationWeeks: 1,
  weakSpots: ['Error propagation'],
  modules: [{
    title: 'Promises',
    week: 1,
    description: 'Asynchronous control flow',
    lessons: [
      { title: 'Promises', kind: 'theory', focus: 'Settling promises' },
      { title: 'Rejection', kind: 'theory', focus: 'Handling failures' },
    ],
  }],
}
const lessonContent: LessonContent = {
  intro: { outcome: 'Recognize a settled promise.', relevance: 'Read asynchronous code.', focus: 'Promise states' },
  exercises: [
    { id: 'learn', type: 'learn', stage: 'learn', prompt: 'A promise can be settled only once.' },
    { id: 'practice', type: 'choice', stage: 'practice', prompt: 'Which states are final?', hint: 'Think about settlement.', explanation: 'Fulfillment and rejection are final.' },
    { id: 'check', type: 'open', stage: 'check', prompt: 'What does a pending state mean?' },
  ],
  flashcards: [{ front: 'Which promise states are final?', back: 'Fulfilled and rejected.' }],
}

function resultResponse(data: unknown) {
  return new Response(`${JSON.stringify({ type: 'done', data })}\n`)
}

let pinia: ReturnType<typeof createPinia>
let store: ReturnType<typeof useApp>

beforeEach(() => {
  pinia = createPinia()
  store = useApp(pinia)
  fetchResponse.mockReset()
  vi.stubGlobal('fetch', fetchResponse)
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
  vi.setSystemTime(new Date(2026, 0, 1, 12))
})

afterEach(() => {
  disposePinia(pinia)
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('saved settings', () => {
  it('loads an older learning plan and preserves defaults for omitted preferences', async () => {
    const plan = { ...planDescription, modules: [], createdAt: Date.now() }
    fetchResponse
      .mockResolvedValueOnce(Response.json({ plan, settings: { locale: 'pl-pl' }, stats: { xp: 80 } }))
      .mockResolvedValueOnce(Response.json({ providers: { claude: { available: true } } }))
      .mockResolvedValueOnce(Response.json({ available: false }))

    await store.load()

    expect(store.loaded).toBe(true)
    expect(store.settings).toMatchObject({ locale: 'pl-PL', setupDone: true, sound: true })
    expect(store.stats).toMatchObject({ xp: 80, streak: 0, history: [] })
  })

  it('saves a valid language immediately and keeps the previous language if saving fails', async () => {
    store.settings.locale = 'en'
    fetchResponse
      .mockResolvedValueOnce(Response.json({ ok: true }))
      .mockResolvedValueOnce(new Response('Read-only storage', { status: 503 }))

    await store.changeLocale('pl-pl')

    expect(store.settings.locale).toBe('pl-PL')
    expect(fetchResponse).toHaveBeenLastCalledWith('/api/state', expect.objectContaining({
      method: 'PUT',
      body: expect.stringContaining('"locale":"pl-PL"'),
    }))
    await expect(store.changeLocale('fr-CA')).rejects.toThrow('503 Read-only storage')
    expect(store.settings.locale).toBe('pl-PL')
  })

  it('ignores an invalid or unchanged locale', async () => {
    store.settings.locale = 'pl-PL'

    await store.changeLocale('pl-pl')
    await store.changeLocale('und')

    expect(store.settings.locale).toBe('pl-PL')
    expect(fetchResponse).not.toHaveBeenCalled()
  })

  it('recalls the preferred model and effort when switching providers', () => {
    store.settings.model = 'claude-model'
    store.settings.effort = 'high'
    store.settings.prefs = { codex: { model: 'codex-model', effort: 'low' } }

    store.switchProvider('codex')
    expect(store.settings).toMatchObject({ provider: 'codex', model: 'codex-model', effort: 'low' })

    store.switchProvider('claude')
    expect(store.settings).toMatchObject({ provider: 'claude', model: 'claude-model', effort: 'high' })
  })

  it('combines successive changes into one save of the latest state', async () => {
    fetchResponse
      .mockResolvedValueOnce(Response.json({}))
      .mockResolvedValueOnce(Response.json({ providers: {} }))
      .mockResolvedValueOnce(Response.json({ available: false }))
      .mockResolvedValueOnce(Response.json({ ok: true }))
    await store.load()

    store.addXp(3)
    await nextTick()
    await vi.advanceTimersByTimeAsync(300)
    store.addXp(4)
    await nextTick()
    await vi.advanceTimersByTimeAsync(399)
    expect(fetchResponse.mock.calls.filter(([, options]) => options?.method === 'PUT')).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(1)
    await store.flushSave()
    const saves = fetchResponse.mock.calls.filter(([, options]) => options?.method === 'PUT')
    expect(saves).toEqual([['/api/state', expect.objectContaining({ body: expect.stringContaining('"xp":7') })]])
  })

  it('can save new settings after a previous save failed', async () => {
    fetchResponse
      .mockResolvedValueOnce(new Response('Read-only storage', { status: 503 }))
      .mockResolvedValueOnce(Response.json({ ok: true }))

    await expect(store.saveNow()).rejects.toThrow('503 Read-only storage')
    store.settings.sound = false
    await expect(store.saveNow()).resolves.toEqual({ ok: true })
    expect(fetchResponse).toHaveBeenLastCalledWith('/api/state', expect.objectContaining({
      body: expect.stringContaining('"sound":false'),
    }))
  })

  it('selects the execution environment according to available runtimes and settings', () => {
    store.docker = { available: true, envs: { javascript: 'Node', typescript: 'TypeScript', python: 'Python' } }

    expect(store.runtimeFor('JavaScript')).toBe('browser')
    store.settings.jsRuntime = 'docker'
    expect(store.runtimeFor('TypeScript')).toBe('docker')
    expect(store.runtimeFor('Python')).toBe('docker')
    expect(store.runtimeFor('Kotlin')).toBe('review')

    store.docker = { available: false }
    expect(store.runtimeFor('Python')).toBe('review')
    expect(store.runtimeFor('JavaScript')).toBe('browser')
  })
})

describe('learning plan', () => {
  it('unlocks the next lesson and awards completion XP once per lesson', async () => {
    fetchResponse.mockResolvedValueOnce(resultResponse(planDescription))
    await store.generatePlan(profile)

    const [first, second] = store.allLessons
    expect(store.gen.status).toBe('done')
    expect(store.currentLesson?.id).toBe(first.id)
    expect(second.status).toBe('locked')
    const cached: CachedLesson = { ...lessonContent, format: 3, generatedAt: Date.now() }
    store.lessons[first.id] = cached
    store.lessons[second.id] = cached

    store.completeLesson(first.id, { xp: 10 })
    expect(store.doneCount).toBe(1)
    expect(store.currentLesson?.id).toBe(second.id)
    expect(store.stats.xp).toBe(30)
    expect(store.flashcards).toHaveLength(1)

    store.completeLesson(first.id, { xp: 10 })
    expect(store.stats.xp).toBe(45)
    expect(store.flashcards).toHaveLength(1)
  })

  it('deduplicates simultaneous lesson generation and returns the cached lesson next time', async () => {
    const generation = Promise.withResolvers<Response>()
    fetchResponse.mockResolvedValueOnce(resultResponse(planDescription)).mockReturnValueOnce(generation.promise)
    await store.generatePlan(profile)
    store.docker = { available: false }
    const id = store.currentLesson!.id

    const first = store.ensureLesson(id)
    const second = store.ensureLesson(id)
    generation.resolve(resultResponse(lessonContent))

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ intro: lessonContent.intro }),
      expect.objectContaining({ intro: lessonContent.intro }),
    ])
    await expect(store.ensureLesson(id)).resolves.toMatchObject({ flashcards: lessonContent.flashcards })
    const requests = fetchResponse.mock.calls.filter(([url]) => url === '/api/ai/lesson')
    expect(requests).toHaveLength(1)
  })

  it('makes a failed generation visible and allows retrying it', async () => {
    fetchResponse
      .mockResolvedValueOnce(Response.json({ error: 'Provider unavailable' }, { status: 503 }))
      .mockResolvedValueOnce(resultResponse(planDescription))

    await store.generatePlan(profile)
    expect(store.gen).toMatchObject({ status: 'error', error: 'Provider unavailable' })
    expect(store.currentLesson).toBeNull()

    await store.generatePlan(profile)
    expect(store.gen).toMatchObject({ status: 'done', error: null })
    expect(store.currentLesson?.title).toBe('Promises')
  })

  it.each([
    { name: 'a successful reference run', run: { results: [{ name: 'doubles 3', ok: true }] }, status: 'verified' },
    { name: 'a sandbox interruption', run: null, status: 'unverified' },
  ])('keeps the generated lesson after $name', async ({ run, status }) => {
    const lesson: LessonContent = {
      ...lessonContent,
      exercises: [
        ...lessonContent.exercises.slice(0, 2),
        {
          id: 'double', type: 'code', stage: 'check', prompt: 'Double the input.',
          files: [{ path: 'main.py', content: 'def double(n): return n' }],
          solutionFiles: [{ path: 'main.py', content: 'def double(n): return 2 * n' }],
          testFiles: [{ path: 'test.py', content: 'from main import double\nassert double(3) == 6' }],
          testCommand: 'python test.py',
        },
      ],
    }
    fetchResponse
      .mockResolvedValueOnce(resultResponse({ ...planDescription, language: 'Python' }))
      .mockResolvedValueOnce(resultResponse(lesson))
    if (run) {
      fetchResponse
        .mockResolvedValueOnce(resultResponse(run))
        .mockResolvedValueOnce(resultResponse({ results: [{ name: 'doubles 3', ok: false }] }))
    } else {
      fetchResponse.mockResolvedValueOnce(new Response('{"type":"error","message":"Docker stopped"}\n'))
    }
    await store.generatePlan(profile)
    store.docker = { available: true, envs: { python: 'Python' } }
    const id = store.currentLesson!.id

    await store.ensureLesson(id)

    expect(store.persisted().lessons[id].exercises[2]).toMatchObject({
      id: `${id}-e2`, runtime: 'docker', codeLanguage: 'python', testsStatus: status,
      ...(run ? { testsTotal: 1 } : {}),
    })
    expect(store.lessonReady(id)).toBe(true)
    expect(store.lessonGen[id]).toBeUndefined()
  })

  it('keeps completed lessons and removes stale lesson content when refining a plan', async () => {
    const refined: PlanDescription = {
      ...planDescription,
      title: 'More asynchronous JavaScript',
      weakSpots: ['Error propagation', 'Parallel promises'],
      modules: [{
        ...planDescription.modules[0],
        lessons: [planDescription.modules[0].lessons[0], { title: 'Promise.all', kind: 'code', focus: 'Parallel work' }],
      }],
    }
    fetchResponse.mockResolvedValueOnce(resultResponse(planDescription)).mockResolvedValueOnce(resultResponse(refined))
    await store.generatePlan(profile)
    const [completed, outdated] = store.allLessons
    const cached: CachedLesson = { ...lessonContent, format: 3, generatedAt: Date.now() }
    store.lessons[completed.id] = cached
    store.lessons[outdated.id] = cached
    store.completeLesson(completed.id, { xp: 1 })
    store.addWeakSpot('Microtasks')
    const createdAt = store.plan!.createdAt

    await store.refinePlan('Add a lesson on parallel promises')

    expect(store.plan).toMatchObject({ title: 'More asynchronous JavaScript', createdAt })
    expect(store.findLesson(completed.id)?.status).toBe('done')
    expect(store.currentLesson?.title).toBe('Promise.all')
    expect(store.lessons).toEqual({ [completed.id]: cached })
    expect(store.weakSpots).toEqual(['Error propagation', 'Parallel promises', 'Microtasks'])
  })

  it.each([
    { content: { ...lessonContent, exercises: [] }, error: 'The model returned an empty lesson' },
    { content: { ...lessonContent, intro: {} }, error: 'The model did not generate a complete lesson introduction.' },
    { content: { ...lessonContent, exercises: lessonContent.exercises.slice(1) }, error: 'The model returned the lesson stages in the wrong order.' },
  ])('allows retry after an invalid lesson ($error)', async ({ content, error }) => {
    fetchResponse
      .mockResolvedValueOnce(resultResponse(planDescription))
      .mockResolvedValueOnce(resultResponse(content))
      .mockResolvedValueOnce(resultResponse(lessonContent))
    await store.generatePlan(profile)
    store.docker = { available: false }
    const id = store.currentLesson!.id

    await expect(store.ensureLesson(id)).rejects.toThrow(error)
    expect(store.lessonReady(id)).toBe(false)
    expect(store.lessonGen[id]?.error).toBe(error)

    await expect(store.ensureLesson(id)).resolves.toMatchObject({ intro: lessonContent.intro })
    expect(store.lessonReady(id)).toBe(true)
    expect(store.lessonGen[id]).toBeUndefined()
  })
})

describe('review progress', () => {
  it('adds unique valid flashcards and removes them after deletion', () => {
    store.addFlashcards([
      { front: 'Promise', back: 'Represents a future result' },
      { front: '  Promise ', back: 'Duplicate' },
      { front: 'Closure', back: ' ' },
    ], 'Promises')

    expect(store.dueCards).toHaveLength(1)
    expect(store.dueCards[0]).toMatchObject({ front: 'Promise', source: 'Promises' })
    store.deleteCard(store.dueCards[0].id)
    expect(store.dueCards).toEqual([])
  })

  it('schedules the next review and updates XP, lapses and score', () => {
    store.addFlashcards(lessonContent.flashcards, 'Promises')
    const id = store.dueCards[0].id
    const time = Date.now()

    store.rateCard(id, 'again')
    expect(store.dueCards).toEqual([])
    expect(store.flashcards[0]).toMatchObject({ lapses: 1, reps: 1, due: time + 60_000 })
    expect(store.stats.xp).toBe(1)

    vi.setSystemTime(time + 60_000)
    store.rateCard(id, 'good')
    expect(store.flashcards[0]).toMatchObject({ lapses: 1, reps: 2, interval: 1 })
    expect(store.stats.xp).toBe(4)
    expect(store.score).toBe(425)
    expect(store.scoreDelta).toBe(425)
  })

  it('counts one streak entry per day and restarts the streak after a missed day', () => {
    store.touchStreak()
    store.touchStreak()
    expect(store.stats.streak).toBe(1)

    vi.setSystemTime(new Date(2026, 0, 2, 12))
    store.touchStreak()
    expect(store.stats.streak).toBe(2)

    vi.setSystemTime(new Date(2026, 0, 4, 12))
    expect(store.streakAlive).toBe(false)
    store.touchStreak()
    expect(store.stats.streak).toBe(1)
  })

  it('keeps recent scores and deduplicates weak spots case-insensitively', () => {
    for (let index = 0; index < 400; index++) store.recordAnswer({ score: -1 })
    store.recordAnswer({ score: 2, weakSpot: '  promise errors' })
    store.recordAnswer({ score: 1, weakSpot: 'Promise errors' })

    expect(store.stats.history).toHaveLength(400)
    expect(store.stats.history[0].score).toBe(0)
    expect(store.score).toBe(50)
    expect(store.weakSpots).toEqual(['Promise errors'])
    store.removeWeakSpot('Promise errors')
    expect(store.weakSpots).toEqual([])
  })

  it('clears learning data and preserves settings when resetting progress', () => {
    store.settings.locale = 'pl'
    store.profile = profile
    store.addXp(10)
    store.addFlashcards(lessonContent.flashcards, 'Test')

    store.resetAll()

    expect(store.settings.locale).toBe('pl')
    expect(store.profile).toBeNull()
    expect(store.stats.xp).toBe(0)
    expect(store.flashcards).toEqual([])
    expect(store.gen.status).toBe('idle')
  })
})
