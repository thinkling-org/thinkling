import { defineStore } from 'pinia'
import { ai, getJSON, putJSON } from '../lib/api.js'
import { newCard, schedule } from '../lib/srs.js'

const today = () => new Date().toLocaleDateString('sv-SE') // YYYY-MM-DD w strefie lokalnej
const dayDiff = (a, b) => Math.round((new Date(b) - new Date(a)) / 86_400_000)

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

function emptyState() {
  return {
    profile: null, // { description, minutesPerDay, style }
    plan: null,
    lessons: {}, // lessonId -> { exercises, flashcards, generatedAt }
    flashcards: [],
    weakSpots: [],
    stats: { xp: 0, streak: 0, lastActiveDay: null, history: [], daily: {} },
    settings: { provider: 'claude', model: '', claudeBin: '', codexBin: '', sound: true, volume: 0.6, jsRuntime: 'browser' },
  }
}

function decoratePlan(raw, previous) {
  const prevDone = new Set()
  previous?.modules?.forEach((m) => m.lessons.forEach((l) => l.status === 'done' && prevDone.add(`${m.title}::${l.title}`)))
  const plan = {
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

function hash(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36).slice(0, 5)
}

/** Pierwsza nieukończona lekcja = current, reszta po niej = locked. */
function refreshStatuses(plan) {
  let currentSet = false
  for (const m of plan.modules) {
    for (const l of m.lessons) {
      if (l.status === 'done') continue
      l.status = currentSet ? 'locked' : 'current'
      currentSet = true
    }
  }
}

// Wersja struktury lekcji. Nieukończone lekcje w starszym formacie generują się od nowa.
const LESSON_FORMAT = 2

let saveTimer = null
const inflight = new Map()

export const useApp = defineStore('app', {
  state: () => ({
    ...emptyState(),
    loaded: false,
    status: null, // /api/status
    docker: null, // /api/sandbox/status
    gen: { status: 'idle', chars: 0, elapsed: 0, partial: null, error: null, mode: 'plan' },
    lessonGen: {}, // lessonId -> { chars, elapsed, error }
  }),

  getters: {
    allLessons(s) {
      if (!s.plan) return []
      return s.plan.modules.flatMap((m, mi) => m.lessons.map((l, li) => ({ ...l, moduleIndex: mi, lessonIndex: li, module: m })))
    },
    currentLesson() {
      return this.allLessons.find((l) => l.status === 'current') || null
    },
    doneCount() {
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
      const avg = (a) => a.reduce((x, y) => x + y.score, 0) / a.length
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
        const data = await getJSON('/api/state')
        const base = emptyState()
        Object.assign(this, base, data, {
          stats: { ...base.stats, ...(data.stats || {}) },
          settings: { ...base.settings, ...(data.settings || {}) },
        })
      } catch (err) {
        console.error('Nie udało się wczytać stanu', err)
      }
      this.loaded = true
      this.refreshStatus()
      this.$subscribe(() => this.scheduleSave(), { detached: true })
    },

    persisted() {
      const { profile, plan, lessons, flashcards, weakSpots, stats, settings } = this.$state
      return { profile, plan, lessons, flashcards, weakSpots, stats, settings }
    },

    scheduleSave() {
      clearTimeout(saveTimer)
      saveTimer = setTimeout(() => putJSON('/api/state', this.persisted()).catch((e) => console.error(e)), 400)
    },

    async refreshStatus() {
      const [s, d] = await Promise.allSettled([getJSON('/api/status'), getJSON('/api/sandbox/status')])
      this.status = s.status === 'fulfilled' ? s.value : { error: true, providers: {} }
      this.docker = d.status === 'fulfilled' ? d.value : { available: false }
    },

    /** Gdzie uruchamiać zadania z kodem: 'browser' (Web Worker), 'docker' (kontener) albo 'review' (tylko ocena modelu). */
    runtimeFor(lang) {
      const l = String(lang || '').toLowerCase()
      const dockerOk = !!(this.docker?.available && this.docker.envs?.[l])
      if (l === 'javascript' || l === 'typescript') return this.settings.jsRuntime === 'docker' && dockerOk ? 'docker' : 'browser'
      return dockerOk ? 'docker' : 'review'
    },

    // ------------------------------------------------------------ plan

    async generatePlan(profile) {
      this.profile = profile
      return this.runPlanTask('plan', profile)
    },

    async refinePlan(feedback) {
      return this.runPlanTask('refinePlan', { ...this.profile, plan: this.plan, feedback })
    },

    async runPlanTask(task, payload) {
      if (this.gen.status === 'running') return
      const previous = task === 'refinePlan' ? this.plan : null
      this.gen = { status: 'running', chars: 0, elapsed: 0, partial: null, error: null, mode: task }
      try {
        const { parsePartialJson } = await import('../lib/partialJson.js')
        const raw = await ai(task, payload, {
          onProgress: (p) => {
            this.gen.chars = p.chars
            this.gen.elapsed = p.elapsed
            if (p.partial) {
              const parsed = parsePartialJson(p.partial)
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

    findLesson(id) {
      return this.allLessons.find((l) => l.id === id) || null
    },

    // ------------------------------------------------------------ lekcje

    lessonReady(id) {
      const c = this.lessons[id]
      if (!c?.exercises?.length) return false
      return c.format === LESSON_FORMAT || this.findLesson(id)?.status === 'done'
    },

    /** Uruchamia testy zadań z kodem na wzorcowym rozwiązaniu i szablonie (raz na zadanie). */
    async validateLesson(id) {
      const c = this.lessons[id]
      const todo = (c?.exercises || []).filter((e) => e.type === 'code' && !e.testsStatus)
      if (!todo.length) return c
      this.lessonGen[id] = { chars: 0, elapsed: 0, error: null, ...(this.lessonGen[id] || {}), stage: 'validating' }
      const { verifyExercise } = await import('../lib/validate.js')
      for (const e of todo) {
        const r = await verifyExercise(e, this.plan?.language, {
          onStage: (s, msg) => this.lessonGen[id] && Object.assign(this.lessonGen[id], { stage: s, stageMsg: msg || '' }),
        })
        if (r.patch) Object.assign(e, r.patch)
        e.testsStatus = r.status
        if (r.total) e.testsTotal = r.total
        if (r.fixed) e.testsFixNote = r.note || 'Testy poprawione automatycznie.'
      }
      delete this.lessonGen[id]
      return c
    },

    ensureLesson(id) {
      if (inflight.has(id)) return inflight.get(id)
      if (this.lessonReady(id)) {
        const needs = this.lessons[id].exercises.some((e) => e.type === 'code' && !e.testsStatus)
        if (!needs || this.findLesson(id)?.status === 'done') return Promise.resolve(this.lessons[id])
        const v = this.validateLesson(id).finally(() => inflight.delete(id))
        inflight.set(id, v)
        return v
      }
      const l = this.findLesson(id)
      if (!l) return Promise.reject(new Error('Nie ma takiej lekcji'))
      this.lessonGen[id] = { chars: 0, elapsed: 0, error: null }
      let runtime = 'browser'
      const p = (this.docker ? Promise.resolve() : this.refreshStatus())
        .then(() => {
          runtime = this.runtimeFor(this.plan?.language)
          return ai(
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
            .map((e, i) => ({
              ...e,
              id: `${id}-e${i}`,
              ...(e.type === 'code'
                ? runtime === 'docker' && e.testCommand && e.files?.length
                  ? { runtime: 'docker', codeLanguage: String(this.plan.language).toLowerCase() }
                  : { runtime: runtime === 'docker' ? 'review' : runtime }
                : {}),
            }))
          if (!exercises.length) throw new Error('Model zwrócił pustą lekcję')
          this.lessons[id] = { exercises, flashcards: data.flashcards || [], generatedAt: Date.now(), format: LESSON_FORMAT }
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

    regenerateLesson(id) {
      delete this.lessons[id]
      return this.ensureLesson(id)
    },

    /** Prefetch następnej lekcji w tle, żeby start był natychmiastowy. */
    prefetchNext(afterId) {
      const list = this.allLessons
      const idx = afterId ? list.findIndex((l) => l.id === afterId) : -1
      const next = afterId ? list.slice(idx + 1).find((l) => l.status !== 'done') : this.currentLesson
      if (next && !this.lessonReady(next.id)) this.ensureLesson(next.id).catch(() => {})
    },

    completeLesson(id, { xp }) {
      const l = this.findLesson(id)
      if (!l) return
      const target = this.plan.modules[l.moduleIndex].lessons[l.lessonIndex]
      const firstTime = target.status !== 'done'
      target.status = 'done'
      refreshStatuses(this.plan)
      this.stats.xp += xp + (firstTime ? 20 : 5)
      const cards = this.lessons[id]?.flashcards || []
      if (firstTime) this.addFlashcards(cards, `lekcja: ${l.title}`)
      this.touchStreak()
      this.prefetchNext(id)
      return firstTime ? 20 : 5
    },

    // ------------------------------------------------------------ statystyki

    recordAnswer({ score, weakSpot }) {
      this.stats.history.push({ t: Date.now(), score: Math.max(0, Math.min(1, score)) })
      if (this.stats.history.length > 400) this.stats.history.splice(0, this.stats.history.length - 400)
      if (weakSpot) this.addWeakSpot(weakSpot)
    },

    addWeakSpot(w) {
      const s = String(w).trim()
      if (!s) return
      this.weakSpots = [s, ...this.weakSpots.filter((x) => x.toLowerCase() !== s.toLowerCase())].slice(0, 8)
    },

    removeWeakSpot(w) {
      this.weakSpots = this.weakSpots.filter((x) => x !== w)
    },

    addXp(n) {
      this.stats.xp += n
    },

    addTime(seconds) {
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

    // ------------------------------------------------------------ fiszki

    addFlashcards(cards, source) {
      const existing = new Set(this.flashcards.map((c) => c.front.trim()))
      for (const c of cards || []) {
        if (!c?.front?.trim() || !c?.back?.trim() || existing.has(c.front.trim())) continue
        existing.add(c.front.trim())
        this.flashcards.push(newCard({ front: c.front, back: c.back, source }))
      }
    },

    rateCard(id, rating) {
      const c = this.flashcards.find((x) => x.id === id)
      if (!c) return
      Object.assign(c, schedule(c, rating))
      c.reps += 1
      if (rating === 'again') c.lapses += 1
      this.recordAnswer({ score: { again: 0, hard: 0.5, good: 0.85, easy: 1 }[rating] })
      this.addXp(rating === 'again' ? 1 : 3)
      this.touchStreak()
    },

    deleteCard(id) {
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
