import { t } from '../lib/i18n.ts'
import { defineStore } from 'pinia'
import { ai, getJSON, putJSON } from '../lib/api.ts'
import { newCard, schedule } from '../lib/srs.ts'
import { normalizeLocale, preferredLocale } from '../lib/languages.ts'
import { LESSON_FORMAT, validateLessonFlow } from '../lib/lesson-flow.ts'
import type {
  AppStatus, CachedLesson, Exercise, FlashcardText, LessonContent, LessonLocation,
  PersistedState, Plan, PlanDescription, PlanPreview, Profile, ProviderId, Rating, Runtime, SandboxStatus,
} from '../domain.ts'

const today = () => new Date().toLocaleDateString('sv-SE') // YYYY-MM-DD w strefie lokalnej
const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)

export const GEMS = [
  ['#F0386B', '#FF8FAE'],
  ['#F59E0B', '#FFD27A'],
  ['#2BC872', '#7CF2B0'],
  ['#3B82F6', '#93C5FD'],
  ['#A855F7', '#D8B4FE'],
  ['#14B8A6', '#5EEAD4'],
  ['#F97316', '#FDBA74'],
  ['#EC4899', '#F9A8D4'],
]

function emptyState(): PersistedState {
  return {
    profile: null, // { description, minutesPerDay, style }
    plan: null,
    lessons: {}, // lessonId -> { intro, exercises, flashcards, generatedAt }
    flashcards: [],
    weakSpots: [],
    stats: { xp: 0, streak: 0, lastActiveDay: null, history: [], daily: {} },
    settings: {
      provider: 'claude', model: '', effort: '', prefs: {}, claudeBin: '', codexBin: '',
      sound: true, volume: 0.6, jsRuntime: 'browser', setupDone: false,
      locale: preferredLocale(globalThis.navigator?.languages || []),
    },
  }
}

function decoratePlan(raw: PlanDescription, previous: Plan | null): Plan {
  const prevDone = new Set<string>()
  previous?.modules?.forEach((m) => m.lessons.forEach((l) => l.status === 'done' && prevDone.add(`${m.title}::${l.title}`)))
  const plan: Plan = {
    ...raw,
    createdAt: previous?.createdAt || Date.now(),
    modules: raw.modules.map((m, mi) => ({
      ...m,
      id: `m${mi}`,
      lessons: m.lessons.map((l, li) => ({
        ...l,
        id: `m${mi}-l${li}-${hash(m.title + l.title)}`,
        status: prevDone.has(`${m.title}::${l.title}`) ? 'done' : 'locked',
      })),
    })),
  }
  refreshStatuses(plan)
  return plan
}

function hash(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36).slice(0, 5)
}

/** Mark the first unfinished lesson as current and subsequent lessons as locked. */
function refreshStatuses(plan: Plan) {
  let currentSet = false
  for (const m of plan.modules) {
    for (const l of m.lessons) {
      if (l.status === 'done') continue
      l.status = currentSet ? 'locked' : 'current'
      currentSet = true
    }
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
let pendingSave: Promise<unknown> = Promise.resolve()
const inflight = new Map<string, Promise<CachedLesson>>()

interface AppState extends PersistedState {
  loaded: boolean
  status: AppStatus | null
  docker: SandboxStatus | null
  gen: {
    status: 'idle' | 'running' | 'done' | 'error'
    chars: number
    elapsed: number
    partial: PlanPreview | null
    error: string | null
    mode: 'plan' | 'refinePlan'
  }
  lessonGen: Record<string, { chars: number; elapsed: number; error: string | null; stage?: string; stageMsg?: string }>
}

type SavedState = Partial<Omit<PersistedState, 'stats' | 'settings'>> & {
  stats?: Partial<PersistedState['stats']>
  settings?: Partial<PersistedState['settings']>
}

export const useApp = defineStore('app', {
  state: (): AppState => ({
    ...emptyState(),
    loaded: false,
    status: null, // /api/status
    docker: null, // /api/sandbox/status
    gen: { status: 'idle', chars: 0, elapsed: 0, partial: null, error: null, mode: 'plan' },
    lessonGen: {}, // lessonId -> { chars, elapsed, error }
  }),

  getters: {
    allLessons(s): LessonLocation[] {
      if (!s.plan) return []
      return s.plan.modules.flatMap((m, mi) => m.lessons.map((l, li) => ({ ...l, moduleIndex: mi, lessonIndex: li, module: m })))
    },
    currentLesson(): LessonLocation | null {
      return this.allLessons.find((l) => l.status === 'current') || null
    },
    doneCount(): number {
      return this.allLessons.filter((l) => l.status === 'done').length
    },
    dueCards(s) {
      const now = Date.now()
      return s.flashcards.filter((c) => c.due <= now)
    },
    score(s) {
      const h = s.stats.history.slice(-40)
      if (!h.length) return 0
      return Math.round((h.reduce((a, x) => a + x.score, 0) / h.length) * 1000)
    },
    scoreDelta(s) {
      const h = s.stats.history
      if (h.length < 2) return 0
      const prev = h.slice(-41, -1)
      const cur = h.slice(-40)
      const avg = (entries: typeof h) => entries.reduce((sum, entry) => sum + entry.score, 0) / entries.length
      return Math.round((avg(cur) - avg(prev)) * 1000)
    },
    todayMinutes(s) {
      return Math.round((s.stats.daily[today()] || 0) / 60)
    },
    streakAlive(s) {
      const last = s.stats.lastActiveDay
      return !!last && dayDiff(last, today()) <= 1
    },
    activeProvider(s) {
      return s.status?.providers?.[s.settings.provider] || null
    },
  },

  actions: {
    async load() {
      try {
        const data = await getJSON<SavedState>('/api/state')
        const base = emptyState()
        Object.assign(this, base, data, {
          stats: { ...base.stats, ...(data.stats || {}) },
          settings: { ...base.settings, ...(data.settings || {}) },
        })
        this.settings.locale = normalizeLocale(this.settings.locale) || base.settings.locale
        // Existing installations with a learning plan can skip setup.
        if (data.settings?.setupDone === undefined && data.plan) this.settings.setupDone = true
      } catch (err) {
        console.error(t('Couldn\'t load saved state'), err)
      }
      this.loaded = true
      this.refreshStatus()
      this.$subscribe(() => this.scheduleSave(), { detached: true })
    },

    persisted(): PersistedState {
      const { profile, plan, lessons, flashcards, weakSpots, stats, settings } = this.$state
      return { profile, plan, lessons, flashcards, weakSpots, stats, settings }
    },

    scheduleSave() {
      clearTimeout(saveTimer)
      saveTimer = setTimeout(() => this.flushSave().catch(console.error), 400)
    },

    flushSave() {
      if (saveTimer === null) return pendingSave
      clearTimeout(saveTimer)
      saveTimer = null
      pendingSave = pendingSave.catch(() => {}).then(() => putJSON('/api/state', this.persisted()))
      return pendingSave
    },

    saveNow() {
      this.scheduleSave()
      return this.flushSave()
    },

    async changeLocale(value: string) {
      const locale = normalizeLocale(value)
      const previous = this.settings.locale
      if (!locale || locale === previous) return
      this.settings.locale = locale
      try {
        await this.saveNow()
      } catch (error) {
        this.settings.locale = previous
        throw error
      }
    },

    /** Switch AI providers and recall the saved model and effort for the selected provider. */
    switchProvider(id: ProviderId) {
      const s = this.settings
      if (s.provider === id) return
      s.prefs = { ...(s.prefs || {}), [s.provider]: { model: s.model, effort: s.effort } }
      s.provider = id
      s.model = s.prefs[id]?.model || ''
      s.effort = s.prefs[id]?.effort || ''
    },

    async refreshStatus() {
      const [s, d] = await Promise.allSettled([getJSON<AppStatus>('/api/status'), getJSON<SandboxStatus>('/api/sandbox/status')])
      this.status = s.status === 'fulfilled' ? s.value : { error: true, providers: {} }
      this.docker = d.status === 'fulfilled' ? d.value : { available: false }
    },

    /** Select browser execution, a Docker container or review by the model. */
    runtimeFor(lang?: string): Runtime {
      const l = String(lang || '').toLowerCase()
      const dockerOk = !!(this.docker?.available && this.docker.envs?.[l])
      if (l === 'javascript' || l === 'typescript') return this.settings.jsRuntime === 'docker' && dockerOk ? 'docker' : 'browser'
      return dockerOk ? 'docker' : 'review'
    },

    // ------------------------------------------------------------ plan

    async generatePlan(profile: Profile) {
      this.profile = profile
      return this.runPlanTask('plan', profile)
    },

    async refinePlan(feedback: string) {
      return this.runPlanTask('refinePlan', { ...this.profile, plan: this.plan, feedback })
    },

    async runPlanTask(task: 'plan' | 'refinePlan', payload: unknown) {
      if (this.gen.status === 'running') return
      const previous = task === 'refinePlan' ? this.plan : null
      this.gen = { status: 'running', chars: 0, elapsed: 0, partial: null, error: null, mode: task }
      try {
        const { parsePartialJson } = await import('../lib/partialJson.ts')
        const raw = await ai<PlanDescription>(task, payload, {
          onProgress: (p) => {
            this.gen.chars = p.chars
            this.gen.elapsed = p.elapsed
            if (p.partial) {
              const parsed = parsePartialJson<PlanPreview>(p.partial)
              if (parsed) this.gen.partial = parsed
            }
          },
        })
        const plan = decoratePlan(raw, previous)
        if (!previous) {
          this.lessons = {}
          this.weakSpots = [...(raw.weakSpots || [])]
        } else {
          const ids = new Set(plan.modules.flatMap((m) => m.lessons.map((l) => l.id)))
          for (const id of Object.keys(this.lessons)) if (!ids.has(id)) delete this.lessons[id]
          this.weakSpots = [...new Set([...(raw.weakSpots || []), ...this.weakSpots])].slice(0, 8)
        }
        this.plan = plan
        this.gen.status = 'done'
        this.gen.partial = null
      } catch (err) {
        this.gen.status = 'error'
        this.gen.error = err.message
      }
    },

    findLesson(id: string) {
      return this.allLessons.find((l) => l.id === id) || null
    },

    // ------------------------------------------------------------ lessons

    lessonReady(id: string) {
      const c = this.lessons[id]
      if (!c?.exercises?.length) return false
      return c.format === LESSON_FORMAT || this.findLesson(id)?.status === 'done'
    },

    /** Verify the reference solution and starter code once per exercise. */
    async validateLesson(id: string): Promise<CachedLesson> {
      const c = this.lessons[id]
      const todo = (c?.exercises || []).filter((e) => e.type === 'code' && !e.testsStatus)
      if (!todo.length) return c
      this.lessonGen[id] = { chars: 0, elapsed: 0, error: null, ...(this.lessonGen[id] || {}), stage: 'validating' }
      const { verifyExercise } = await import('../lib/validate.ts')
      for (const e of todo) {
        const r = await verifyExercise(e, this.plan?.language, {
          onStage: (s, msg) => this.lessonGen[id] && Object.assign(this.lessonGen[id], { stage: s, stageMsg: msg || '' }),
        })
        if (r.patch) Object.assign(e, r.patch)
        e.testsStatus = r.status
        if (r.total) e.testsTotal = r.total
        if (r.fixed) e.testsFixNote = r.note || t('Tests repaired automatically.')
      }
      delete this.lessonGen[id]
      return c
    },

    ensureLesson(id: string): Promise<CachedLesson> {
      if (inflight.has(id)) return inflight.get(id)
      if (this.lessonReady(id)) {
        const needs = this.lessons[id].exercises.some((e) => e.type === 'code' && !e.testsStatus)
        if (!needs || this.findLesson(id)?.status === 'done') return Promise.resolve(this.lessons[id])
        const v = this.validateLesson(id).finally(() => inflight.delete(id))
        inflight.set(id, v)
        return v
      }
      const l = this.findLesson(id)
      if (!l) return Promise.reject(new Error(t('Lesson not found')))
      this.lessonGen[id] = { chars: 0, elapsed: 0, error: null }
      let runtime: Runtime = 'browser'
      const p = (this.docker ? Promise.resolve() : this.refreshStatus())
        .then(() => {
          runtime = this.runtimeFor(this.plan?.language)
          return ai<LessonContent>(
            'lesson',
            { profile: this.profile, plan: this.plan, moduleIndex: l.moduleIndex, lessonIndex: l.lessonIndex, weakSpots: this.weakSpots, runtime },
            {
              onProgress: (pr) => {
                if (this.lessonGen[id]) Object.assign(this.lessonGen[id], { chars: pr.chars, elapsed: pr.elapsed })
              },
            },
          )
        })
        .then((data) => {
          const exercises = (data.exercises || [])
            .filter((e) => e && e.type)
            .map((e, i): Exercise => ({
              ...e,
              id: `${id}-v${LESSON_FORMAT}-e${i}`,
              ...(e.type === 'code'
                ? runtime === 'docker' && e.testCommand && e.files?.length
                  ? { runtime: 'docker', codeLanguage: String(this.plan.language).toLowerCase() }
                  : { runtime: runtime === 'docker' ? 'review' : runtime }
                : {}),
            }))
          if (!exercises.length) throw new Error(t('The model returned an empty lesson'))
          validateLessonFlow(l.kind, data.intro, exercises)
          this.lessons[id] = { intro: data.intro, exercises, flashcards: data.flashcards || [], generatedAt: Date.now(), format: LESSON_FORMAT }
          return this.validateLesson(id)
        })
        .then(() => {
          delete this.lessonGen[id]
          return this.lessons[id]
        })
        .catch((err) => {
          if (this.lessonGen[id]) this.lessonGen[id].error = err.message
          throw err
        })
        .finally(() => inflight.delete(id))
      inflight.set(id, p)
      return p
    },

    regenerateLesson(id: string) {
      delete this.lessons[id]
      return this.ensureLesson(id)
    },

    /** Prefetch the next lesson in the background. */
    prefetchNext(afterId?: string) {
      const list = this.allLessons
      const idx = afterId ? list.findIndex((l) => l.id === afterId) : -1
      const next = afterId ? list.slice(idx + 1).find((l) => l.status !== 'done') : this.currentLesson
      if (next && !this.lessonReady(next.id)) this.ensureLesson(next.id).catch(() => {})
    },

    completeLesson(id: string, { xp }: { xp: number }) {
      const l = this.findLesson(id)
      if (!l) return
      const target = this.plan.modules[l.moduleIndex].lessons[l.lessonIndex]
      const firstTime = target.status !== 'done'
      target.status = 'done'
      refreshStatuses(this.plan)
      this.stats.xp += xp + (firstTime ? 20 : 5)
      const cards = this.lessons[id]?.flashcards || []
      if (firstTime) this.addFlashcards(cards, t('lesson: {0}', [l.title]))
      this.touchStreak()
      this.prefetchNext(id)
      return firstTime ? 20 : 5
    },

    // ------------------------------------------------------------ statystyki

    recordAnswer({ score, weakSpot }: { score: number; weakSpot?: string }) {
      this.stats.history.push({ t: Date.now(), score: Math.max(0, Math.min(1, score)) })
      if (this.stats.history.length > 400) this.stats.history.splice(0, this.stats.history.length - 400)
      if (weakSpot) this.addWeakSpot(weakSpot)
    },

    addWeakSpot(w: string) {
      const s = String(w).trim()
      if (!s) return
      this.weakSpots = [s, ...this.weakSpots.filter((x) => x.toLowerCase() !== s.toLowerCase())].slice(0, 8)
    },

    removeWeakSpot(w: string) {
      this.weakSpots = this.weakSpots.filter((x) => x !== w)
    },

    addXp(n: number) {
      this.stats.xp += n
    },

    addTime(seconds: number) {
      if (!seconds || seconds < 1) return
      const d = today()
      this.stats.daily[d] = (this.stats.daily[d] || 0) + Math.round(seconds)
    },

    touchStreak() {
      const d = today()
      const last = this.stats.lastActiveDay
      if (last === d) return
      this.stats.streak = last && dayDiff(last, d) === 1 ? this.stats.streak + 1 : 1
      this.stats.lastActiveDay = d
    },

    // ------------------------------------------------------------ flashcards

    addFlashcards(cards: FlashcardText[], source: string) {
      const existing = new Set(this.flashcards.map((c) => c.front.trim()))
      for (const c of cards || []) {
        if (!c?.front?.trim() || !c?.back?.trim() || existing.has(c.front.trim())) continue
        existing.add(c.front.trim())
        this.flashcards.push(newCard({ front: c.front, back: c.back, source }))
      }
    },

    rateCard(id: string, rating: Rating) {
      const c = this.flashcards.find((x) => x.id === id)
      if (!c) return
      Object.assign(c, schedule(c, rating))
      c.reps += 1
      if (rating === 'again') c.lapses += 1
      this.recordAnswer({ score: { again: 0, hard: 0.5, good: 0.85, easy: 1 }[rating] })
      this.addXp(rating === 'again' ? 1 : 3)
      this.touchStreak()
    },

    deleteCard(id: string) {
      this.flashcards = this.flashcards.filter((c) => c.id !== id)
    },

    // ------------------------------------------------------------ reset

    resetPlan() {
      this.plan = null
      this.lessons = {}
      this.gen = { status: 'idle', chars: 0, elapsed: 0, partial: null, error: null, mode: 'plan' }
    },

    resetAll() {
      const settings = this.settings
      Object.assign(this, emptyState(), { settings })
      this.gen = { status: 'idle', chars: 0, elapsed: 0, partial: null, error: null, mode: 'plan' }
    },
  },
})
