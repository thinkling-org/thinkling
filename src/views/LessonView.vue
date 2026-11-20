<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { play, prepareSfx } from '../lib/sfx.js'
import { useRoute, useRouter } from 'vue-router'
import { useApp } from '../stores/app.js'
import { ai } from '../lib/api.js'
import { allTestsPassed } from '../lib/runner.js'
import { describeVisualization, readComparisonSteps, readLessonVisualization } from '../lib/lesson-visualizations.js'
import CodeTrace from '../components/CodeTrace.vue'
import Icon from '../components/Icon.vue'
import Gem from '../components/Gem.vue'
import LessonFooter from '../components/LessonFooter.vue'
import LessonIntro from '../components/LessonIntro.vue'
import Markdown from '../components/Markdown.vue'
import AskDrawer from '../components/AskDrawer.vue'
import ExerciseFooter from '../components/exercises/ExerciseFooter.vue'
import OpenExercise from '../components/exercises/OpenExercise.vue'
import LearnCard from '../components/exercises/LearnCard.vue'
import ChoiceExercise from '../components/exercises/ChoiceExercise.vue'
import CodeExercise from '../components/exercises/CodeExercise.vue'

const route = useRoute()
const router = useRouter()
const app = useApp()

const id = computed(() => route.params.id)
const meta = computed(() => app.findLesson(id.value))
const lesson = computed(() => app.lessons[id.value])
const intro = computed(() => lesson.value?.intro)
const gen = computed(() => app.lessonGen[id.value])
const allExercises = computed(() => lesson.value?.exercises || [])

// Uczeń deklaruje na ekranie powitalnym, ile już wie; od tego zależy, ile teorii zobaczy.
const LEVELS = [
  { label: 'Pierwszy raz słyszę', plan: 'Zaczniemy od podstaw i przykładów, bez pośpiechu.', pick: (list) => list },
  {
    label: 'Coś kojarzę',
    plan: 'Jedna karta przypomnienia, potem od razu ćwiczenia.',
    pick: (list) => list.filter((e, k) => e.stage !== 'learn' || list.findIndex((x) => x.stage === 'learn') === k),
  },
  {
    label: 'Znam, chcę powtórkę',
    plan: 'Od razu pytania sprawdzające, bez teorii. Wyjaśnienie zobaczysz po każdej odpowiedzi.',
    pick: (list) => list.filter((e) => e.stage === 'check' || e.stage === 'challenge'),
  },
]
const level = ref(0)
const levels = computed(() => {
  if (meta.value?.kind === 'test') return []
  return LEVELS.map((option) => ({ ...option, exercises: option.pick(allExercises.value) }))
    .filter((option, k) => k === 0 || option.exercises.length)
})
const exercises = computed(() => levels.value[level.value]?.exercises || allExercises.value)
const MINUTES = { learn: 2, choice: 1, open: 2, code: 5 }
const estimate = computed(() => {
  const list = exercises.value
  const minutes = Math.max(1, Math.round(list.reduce((sum, e) => sum + (MINUTES[e.type] || 1), 0)))
  const graded = list.filter((e) => e.stage === 'check')
  const xpMax = graded.reduce((sum, e) => sum + (e.type === 'code' ? 20 : 10), 0) + (meta.value?.status === 'done' ? 5 : 20)
  const n = list.length
  const noun = n === 1 ? 'ćwiczenie' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'ćwiczenia' : 'ćwiczeń'
  return { minutes, count: `${n} ${noun}`, xp: xpMax }
})
const providerName = computed(() => (app.settings.provider === 'codex' ? 'Codex' : 'Claude'))

const phase = ref('loading') // loading | error | intro | play | summary
const loadError = ref('')
const idx = ref(0)
const answers = reactive({})
const results = reactive({})
const issues = reactive({})
const stage = ref(null)
const busy = ref(false)
const xp = ref(0)
const bonus = ref(0)
const startedAt = Date.now()
let timeCommitted = false

const ex = computed(() => exercises.value[idx.value])
const res = computed(() => (ex.value ? results[ex.value.id] : null))
const progress = computed(() => {
  if (phase.value === 'intro' || phase.value === 'loading') return 0
  const n = exercises.value.length || 1
  return Math.round(((idx.value + (res.value ? 1 : 0)) / n) * 100)
})

async function load() {
  if (!meta.value || meta.value.status === 'locked') return router.replace('/path')
  phase.value = 'loading'
  loadError.value = ''
  try {
    await app.ensureLesson(id.value)
    initAnswers()
    phase.value = 'intro'
  } catch (err) {
    loadError.value = err.message
    phase.value = 'error'
  }
}

async function regenerate() {
  phase.value = 'loading'
  try {
    await app.regenerateLesson(id.value)
    idx.value = 0
    level.value = 0
    for (const state of [answers, results, issues]) {
      for (const key of Object.keys(state)) delete state[key]
    }
    initAnswers()
    phase.value = 'intro'
  } catch (err) {
    loadError.value = err.message
    phase.value = 'error'
  }
}

function initAnswers() {
  for (const e of allExercises.value) {
    if (answers[e.id] !== undefined) continue
    answers[e.id] = e.type === 'choice' ? null : e.type === 'code' ? e.starterCode || '' : ''
    if (e.type === 'code') issues[e.id] = []
  }
}

const canCheck = computed(() => {
  if (!ex.value || busy.value) return false
  if (res.value && !(ex.value.type === 'code' && res.value.retry)) return false
  const a = answers[ex.value.id]
  if (ex.value.type === 'choice') return a !== null && a !== undefined
  if (ex.value.type === 'open') return String(a || '').trim().length >= 3
  return true
})

// ------------------------------------------------------------- sprawdzanie

const codeRef = ref(null)

async function check() {
  if (!canCheck.value) return
  prepareSfx()
  const e = ex.value
  if (e.type === 'choice') return checkChoice(e)
  if (e.type === 'open') return checkOpen(e)
  if (e.type === 'code') return checkCode(e)
}

function checkChoice(e) {
  if (e.stage === 'practice') return revealPractice(e, true)
  const ok = answers[e.id] === e.correctIndex
  results[e.id] = { status: ok ? 'correct' : 'wrong' }
  nextTick(() => stage.value?.querySelector('.explain')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
  if (e.stage === 'challenge') return
  if (e.warmup) {
    // rozgrzewka przed kartą wiedzy — bez kary, bez fiszki
    xp.value += ok ? 5 : 2
    return
  }
  app.recordAnswer({ score: ok ? 1 : 0 })
  if (ok) xp.value += 10
  else {
    const front = `${e.prompt}${e.code ? `\n\n\`\`\`${e.codeLanguage || ''}\n${e.code}\n\`\`\`` : ''}`
    app.addFlashcards([{ front, back: `**${e.options[e.correctIndex]}**\n\n${e.explanation}` }], `błąd w lekcji: ${meta.value?.title}`)
  }
}

function revealPractice(e, submitted = false) {
  play(submitted ? (answers[e.id] === e.correctIndex ? 'correct' : 'almost') : 'pop')
  results[e.id] = { status: 'practice' }
  nextTick(() => stage.value?.querySelector('.explain')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
}

async function checkOpen(e) {
  busy.value = true
  try {
    const data = await ai('gradeOpen', { exercise: e, answer: answers[e.id], level: app.plan?.level })
    const status = data.verdict || (data.score >= 8 ? 'correct' : data.score >= 5 ? 'almost' : 'wrong')
    results[e.id] = { status, data }
    app.recordAnswer({ score: (data.score || 0) / 10, weakSpot: data.weakSpot })
    xp.value += Math.max(1, data.score || 0)
    if (data.flashcard?.front) app.addFlashcards([data.flashcard], `z błędu w lekcji: ${meta.value?.title}`)
  } catch (err) {
    results[e.id] = { status: 'error', error: err.message }
  } finally {
    busy.value = false
  }
}

async function checkCode(e) {
  busy.value = true
  try {
    let run = null
    if (codeRef.value?.runnable) run = await codeRef.value.runAll()
    codeRef.value?.showReview()
    const payload = { exercise: e, testResults: run, level: app.plan?.level }
    if (e.runtime === 'docker') payload.files = await codeRef.value.getFiles()
    else payload.code = answers[e.id]
    const data = await ai('reviewCode', payload)
    // przy niezweryfikowanych testach decyduje review modelu
    const testsOk = !run || allTestsPassed(run) || e.testsStatus === 'unverified'
    const status = data.passed && testsOk ? 'correct' : data.score >= 5 ? 'almost' : 'wrong'
    const prev = results[e.id]?.status
    results[e.id] = { status, data }
    issues[e.id] = data.issues || []
    if (!prev || prev === 'error') {
      app.recordAnswer({ score: (data.score || 0) / 10, weakSpot: data.weakSpot })
      xp.value += status === 'correct' ? 20 : status === 'almost' ? 10 : 3
      if (data.flashcard?.front) app.addFlashcards([data.flashcard], `z zadania: ${e.title}`)
    } else if (status === 'correct' && prev !== 'correct') {
      xp.value += 5 // poprawka po review
    }
  } catch (err) {
    results[e.id] = { status: 'error', error: err.message }
  } finally {
    busy.value = false
  }
}

function retryExercise() {
  if (res.value.status === 'error') delete results[ex.value.id]
  else res.value.retry = true
}

const codeRetrying = computed(() => ex.value?.type === 'code' && res.value?.retry)

// ------------------------------------------------------------- dźwięki

watch(
  () => [ex.value?.id, res.value?.status],
  ([eid, status], [peid, pstatus] = []) => {
    if (!status || (eid === peid && status === pstatus)) return
    if (eid !== peid) return // przejście do kolejnego ćwiczenia z gotowym wynikiem
    if (status === 'correct') play('correct')
    else if (status === 'almost') play('almost')
    else if (status === 'wrong') play(ex.value?.warmup ? 'almost' : 'wrong')
    else if (status === 'unknown') play('pop', 0.8)
  },
)
watch(
  () => (ex.value?.type === 'choice' ? answers[ex.value.id] : undefined),
  (v, old) => {
    if (v !== undefined && v !== null && v !== old && !res.value) play('tick')
  },
)

function skip() {
  const e = ex.value
  if (e.stage === 'practice') return revealPractice(e)
  if (e.stage === 'challenge') return next()
  results[e.id] = { status: 'skipped' }
  if (!e.warmup) app.recordAnswer({ score: 0 })
}

/** Pytanie otwarte: uczciwe "nie wiem" — pokazujemy wzorcową odpowiedź i dodajemy ją do fiszek. */
function dontKnow() {
  const e = ex.value
  results[e.id] = { status: 'unknown' }
  app.recordAnswer({ score: 0 })
  app.addFlashcards([{ front: e.prompt, back: e.referenceAnswer }], `„nie wiem” w lekcji: ${meta.value?.title}`)
  nextTick(() => stage.value?.querySelector('.feedback')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
}

function saveConcept({ term, explanation }) {
  app.addWeakSpot(term)
  app.addFlashcards([{ front: `Co oznacza ${term}?`, back: explanation }], `pojęcie z lekcji: ${meta.value?.title}`)
}

// ------------------------------------------------------------- prześledzenie kodu

const showTrace = ref(false)
const activeVariant = ref(0)
const comparisonIndex = ref(0)
const traceState = reactive({})
const comparisonVariant = computed(() => {
  const visualization = readLessonVisualization(ex.value)
  return visualization?.type === 'code-comparison' ? visualization.variants[activeVariant.value] : null
})
const comparisonSteps = computed(() => readComparisonSteps(comparisonVariant.value))
const comparisonStep = computed(() => comparisonSteps.value[comparisonIndex.value] || null)
const hasNextComparisonStep = computed(() => comparisonIndex.value < comparisonSteps.value.length - 1)

function selectVariant(index) {
  activeVariant.value = index
  comparisonIndex.value = 0
}

async function openTrace() {
  const e = ex.value
  if (!e?.code) return explainInChat()
  showTrace.value = true
  window.scrollTo({ top: 0 })
  if (e.trace || traceState[e.id]?.loading) return
  const state = (traceState[e.id] = reactive({ loading: true, chars: 0, error: null }))
  try {
    const data = await ai('trace', { exercise: e, chosenIndex: answers[e.id] }, { onProgress: (p) => (state.chars = p.chars) })
    if (!data?.steps?.length) throw new Error('Model nie zwrócił kroków')
    e.trace = data
  } catch (err) {
    state.error = err.message
  } finally {
    state.loading = false
  }
}

function next() {
  if (hasNextComparisonStep.value) {
    comparisonIndex.value++
    play('pop', 1.2)
    return
  }
  advanceExercise()
}

function advanceExercise() {
  if (ex.value?.type === 'learn') play('pop', 1.2)
  goToExercise(idx.value + 1)
}

async function startLesson() {
  phase.value = 'play'
  await nextTick()
  const heading = stage.value?.querySelector('h1')
  heading?.setAttribute('tabindex', '-1')
  heading?.focus()
}

function goToExercise(index) {
  selectVariant(0)
  showTrace.value = false
  drawerOpen.value = false
  drawer.value?.reset()
  window.scrollTo({ top: 0 })
  if (index >= exercises.value.length) finish()
  else idx.value = index
}

function finish() {
  const graded = exercises.value.filter((e) => e.stage ? e.stage === 'check' : e.type !== 'learn' && !e.warmup)
  const correct = graded.filter((e) => results[e.id]?.status === 'correct').length
  accuracy.value = graded.length ? Math.round((correct / graded.length) * 100) : 100
  bonus.value = app.completeLesson(id.value, { xp: xp.value }) || 0
  commitTime()
  play('complete')
  phase.value = 'summary'
}

const accuracy = ref(0)
const elapsedText = computed(() => {
  const s = Math.round((Date.now() - startedAt) / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
})

function commitTime() {
  if (timeCommitted) return
  timeCommitted = true
  app.addTime(Math.min((Date.now() - startedAt) / 1000, 3 * 60 * 60))
}

function close() {
  const answered = Object.keys(results).length
  if (phase.value === 'play' && answered && !confirm('Przerwać lekcję? Postęp tej lekcji nie zostanie zapisany (fiszki z błędów zostają).')) return
  router.push('/path')
}

// ------------------------------------------------------------- dopytaj

const drawer = ref(null)
const drawerOpen = ref(false)
const drawerContext = computed(() => {
  const e = ex.value
  if (!e) return ''
  const a = answers[e.id]
  const r = res.value
  const parts = [`Lekcja: ${meta.value?.title} (${meta.value?.module?.title})`, `Typ ćwiczenia: ${e.type}`]
  if (app.profile?.description) parts.push(`Deklarowane doświadczenie i cel ucznia: ${app.profile.description}`)
  if (e.type === 'learn') {
    parts.push(`Karta wiedzy: ${e.title}\n${e.prompt}${e.code ? `\n\nPrzykład:\n\`\`\`\n${e.code}\n\`\`\`` : ''}\n\nWyjaśnienie: ${e.explanation}`)
    const visualization = describeVisualization(readLessonVisualization(e))
    if (visualization) parts.push(visualization)
  } else if (e.type === 'code') {
    parts.push(`Zadanie: ${e.title}\n${e.prompt}\nWymagania: ${(e.requirements || []).join('; ')}`)
    parts.push(`Kod ucznia:\n\`\`\`\n${a}\n\`\`\``)
    if (r?.data?.summary) parts.push(`Review: ${r.data.summary}`)
  } else {
    parts.push(`Pytanie: ${e.prompt}`)
    if (e.code) parts.push(`Kod:\n\`\`\`\n${e.code}\n\`\`\``)
    if (e.type === 'choice') {
      parts.push(`Opcje: ${e.options.map((o, i) => `${i + 1}) ${o}`).join(' | ')}`)
      parts.push(`Poprawna: ${e.correctIndex + 1}. Wybór ucznia: ${a === null ? 'brak' : a + 1}`)
      parts.push(`Wyjaśnienie: ${e.explanation}`)
    } else {
      parts.push(`Odpowiedź ucznia: ${a || '(brak)'}`)
      parts.push(`Wzorcowa odpowiedź: ${e.referenceAnswer}`)
      if (r?.data) parts.push(`Ocena: ${r.data.score}/10`)
    }
  }
  return parts.join('\n\n')
})

function openAsk() {
  drawerOpen.value = true
}
function explainInChat() {
  drawerOpen.value = true
  const exercise = ex.value
  drawer.value?.explain({ exercise, chosenIndex: answers[exercise.id] })
}

// ------------------------------------------------------------- klawiatura

function onKey(e) {
  if (e.defaultPrevented || e.repeat || e.altKey || e.shiftKey || phase.value !== 'play' || drawerOpen.value) return
  if (showTrace.value && ex.value?.type === 'learn') return
  const target = e.target
  const typing = target.closest?.('textarea, input, .monaco-editor') || target.isContentEditable
  if (target.closest?.('button, a, select, summary, audio, [role=button]')) return
  if (e.key === 'Enter' && (!typing || e.ctrlKey || e.metaKey)) {
    if (ex.value?.type === 'learn' || (res.value && !codeRetrying.value)) {
      e.preventDefault()
      next()
    } else if (canCheck.value && ex.value.type !== 'code') {
      e.preventDefault()
      check()
    }
  }
  if (!typing && !e.ctrlKey && !e.metaKey && ex.value?.type === 'choice' && !res.value) {
    const n = Number(e.key)
    if (Number.isInteger(n) && n >= 1 && n <= ex.value.options.length) answers[ex.value.id] = n - 1
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  load()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  if (phase.value !== 'summary' && Object.keys(results).length) commitTime()
})

const wide = computed(() => phase.value === 'play' && ex.value?.type === 'code')
const loadingTips = [
  'Po przykładzie możesz spróbować samodzielnie, z podpowiedzią i bez oceny.',
  'Następna lekcja przygotowuje się w tle, gdy robisz tę.',
  'Błędy trafiają do fiszek — wrócą w powtórce.',
  'Enter = sprawdź / dalej. Klawisze 1–4 wybierają odpowiedź.',
]
const tip = loadingTips[Math.floor(Math.random() * loadingTips.length)]
</script>

<template>
  <div class="lesson" :class="{ wide, tracing: showTrace, 'ask-open': drawerOpen }">
    <header class="lh">
      <button class="x" aria-label="Zamknij lekcję" @click="close"><Icon name="x" :size="26" :stroke="2.8" /></button>
      <div class="bar"><div :style="{ width: `${phase === 'summary' ? 100 : progress}%` }" /></div>
      <span v-if="phase === 'play'" class="count">{{ idx + 1 }} / {{ exercises.length }}</span>
    </header>

    <!-- ładowanie -->
    <main v-if="phase === 'loading'" class="center">
      <Gem :index="meta?.moduleIndex || 0" :size="88" glow class="bob" />
      <h2>{{ providerName }} przygotowuje lekcję</h2>
      <p class="sub">{{ meta?.title }}</p>
      <div class="gen card">
        <span class="spinner" />
        <span v-if="gen?.stage === 'building'">Przygotowuję środowisko (jednorazowo)… <span class="muted mono">{{ gen.stageMsg }}</span></span>
        <span v-else-if="gen?.stage === 'validating'">Sprawdzam testy na wzorcowym rozwiązaniu…</span>
        <span v-else-if="gen?.stage === 'fixing'">Test nie przeszedł — {{ providerName }} poprawia zadanie…</span>
        <span v-else>{{ (gen?.chars || 0).toLocaleString('pl-PL') }} znaków · {{ Math.round((gen?.elapsed || 0) / 1000) }} s</span>
      </div>
      <p class="tip">{{ tip }}</p>
    </main>

    <main v-else-if="phase === 'error'" class="center">
      <h2>Nie udało się przygotować lekcji</h2>
      <p class="err">{{ loadError }}</p>
      <div class="row">
        <RouterLink to="/path" class="btn">Wróć</RouterLink>
        <button class="btn btn-primary" @click="regenerate">Spróbuj ponownie</button>
      </div>
    </main>

    <main v-else-if="phase === 'intro'" class="stage">
      <LessonIntro v-model:level="level" :meta="meta" :intro="intro" :levels="levels" />
    </main>

    <!-- podsumowanie -->
    <main v-else-if="phase === 'summary'" class="center">
      <Gem :index="meta?.moduleIndex || 0" :size="120" glow class="pop" />
      <h1 class="done-t">Lekcja ukończona!</h1>
      <p class="sub">{{ meta?.title }}</p>
      <div class="sum">
        <div class="sum-c y"><span class="sl">Łącznie XP</span><span class="sv">{{ xp + bonus }}</span></div>
        <div class="sum-c g"><span class="sl">Dokładność</span><span class="sv">{{ accuracy }}%</span></div>
        <div class="sum-c b"><span class="sl">Czas</span><span class="sv">{{ elapsedText }}</span></div>
      </div>
    </main>

    <!-- ćwiczenia -->
    <main v-else-if="ex" ref="stage" class="stage">
      <div class="inner" :key="ex.id">
        <template v-if="showTrace && (ex.type === 'learn' || ex.type === 'choice')">
          <button class="link-btn back" @click="showTrace = false">
            <Icon name="arrow-left" :size="16" />{{ ex.type === 'learn' ? 'Wróć do karty wiedzy' : 'Wróć do pytania' }}
          </button>
          <CodeTrace v-if="ex.trace" :exercise="ex" :trace="ex.trace" :chosen-index="answers[ex.id]" />
          <div v-else-if="traceState[ex.id]?.error" class="card trace-wait">
            <strong style="color: var(--red-light)">Nie udało się przygotować prześledzenia</strong>
            <span class="err">{{ traceState[ex.id].error }}</span>
            <button class="btn btn-sm btn-primary" @click="openTrace">Spróbuj ponownie</button>
          </div>
          <div v-else class="card trace-wait">
            <span class="spinner" />
            <span>{{ providerName }} śledzi wykonanie kodu… <span class="muted mono">{{ traceState[ex.id]?.chars || 0 }} zn</span></span>
          </div>
        </template>
        <LearnCard
          v-else-if="ex.type === 'learn'"
          :active-variant="activeVariant"
          :comparison-step="comparisonStep"
          :exercise="ex"
          @update:active-variant="selectVariant"
          @trace="openTrace"
          @review-concept="saveConcept"
        />
        <OpenExercise
          v-else-if="ex.type === 'open'"
          v-model="answers[ex.id]"
          :exercise="ex"
          :result="res"
          :busy="busy"
          :provider-name="providerName"
          @submit="check"
        />
        <ChoiceExercise v-else-if="ex.type === 'choice'" v-model="answers[ex.id]" :exercise="ex" :result="res" />
        <CodeExercise
          v-else-if="ex.type === 'code'"
          ref="codeRef"
          v-model="answers[ex.id]"
          v-model:issues="issues[ex.id]"
          :exercise="ex"
          :result="res"
          :busy="busy"
          @submit="check"
        />
      </div>
    </main>

    <LessonFooter v-if="phase === 'intro'" tone="idle">
      <template #left>
        <span class="intro-stats">
          <span>~{{ estimate.minutes }} min</span><span aria-hidden="true">·</span>
          <span>{{ estimate.count }}</span><span aria-hidden="true">·</span>
          <span class="xp">do +{{ estimate.xp }} XP</span>
        </span>
      </template>
      <button type="button" class="btn btn-primary btn-lg" @click="startLesson">
        {{ meta?.kind === 'test' ? 'Rozpocznij sprawdzian' : 'Zacznij naukę' }}
      </button>
    </LessonFooter>

    <LessonFooter v-else-if="phase === 'summary'" tone="idle">
      <template #left>
        <RouterLink v-if="app.dueCards.length" to="/review" class="btn btn-ghost">Fiszki ({{ app.dueCards.length }})</RouterLink>
      </template>
      <RouterLink to="/path" class="btn btn-primary btn-lg">Dalej</RouterLink>
    </LessonFooter>

    <ExerciseFooter
      v-else-if="phase === 'play' && ex"
      :exercise="ex"
      :result="res"
      :provider-name="providerName"
      :busy="busy"
      :can-check="canCheck"
      :tracing="showTrace"
      :next-step="hasNextComparisonStep"
      :can-skip-learn="!comparisonVariant || hasNextComparisonStep"
      @ask="openAsk"
      @check="check"
      @dont-know="dontKnow"
      @know-it="advanceExercise"
      @next="next"
      @retry="retryExercise"
      @skip="skip"
      @trace="openTrace"
    />

    <AskDrawer ref="drawer" :open="drawerOpen" :context="drawerContext" @close="drawerOpen = false" />
  </div>
</template>

<style scoped>
.lesson {
  --ask-width: clamp(340px, 28vw, 440px);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
@media (min-width: 1100px) {
  .lesson.ask-open {
    padding-right: var(--ask-width);
  }
}
.lh {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 24px 32px;
  max-width: 1100px;
  width: 100%;
  margin: 0 auto;
}
.wide .lh {
  max-width: none;
  padding: 16px 28px;
}
.x {
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  padding: 4px;
  display: grid;
  border-radius: 10px;
}
.x:hover {
  color: var(--text);
}
.count {
  font-weight: 900;
  font-size: 16px;
  color: var(--muted);
  white-space: nowrap;
}
.stage {
  flex: 1;
  display: flex;
  justify-content: center;
  padding: 20px 24px 32px;
}
.inner {
  width: 100%;
  max-width: 760px;
  animation: dl-pop 0.25s ease-out;
}
.intro-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  color: var(--muted);
  font-size: 15px;
  font-weight: 800;
}
.intro-stats .xp {
  color: var(--blue);
}
.wide .stage {
  padding: 4px 28px 20px;
}
.lesson.tracing .inner {
  max-width: 1100px;
}
.back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
}
.trace-wait {
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  font-weight: 700;
  color: var(--text-3);
}
.trace-wait .err {
  font-family: var(--mono);
  font-size: 13px;
  width: 100%;
}
.mono {
  font-family: var(--mono);
  font-size: 13px;
}
.wide .inner {
  max-width: none;
}
.center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 24px;
  text-align: center;
}
.center h2 {
  font-size: 28px;
}
.sub {
  margin: 0;
  color: var(--text-3);
  font-weight: 700;
  font-size: 17px;
}
.gen {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 18px;
  font-family: var(--mono);
  font-size: 14px;
  color: var(--text-3);
  margin-top: 10px;
}
.tip {
  color: var(--muted);
  font-weight: 600;
  max-width: 420px;
}
.err {
  font-family: var(--mono);
  font-size: 13px;
  color: var(--red-light);
  max-width: 640px;
  white-space: pre-wrap;
}
.row {
  display: flex;
  gap: 10px;
}
.bob {
  animation: dl-bob 2s ease-in-out infinite;
}
.pop {
  animation: dl-pop 0.5s ease-out;
}
.done-t {
  font-size: 40px;
  color: var(--yellow);
  margin-top: 10px;
}
.sum {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  justify-content: center;
  margin-top: 18px;
}
.sum-c {
  width: 150px;
  border-radius: 18px;
  border: 2px solid;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.sl {
  padding: 6px 10px;
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--bg);
}
.sv {
  padding: 16px 10px;
  font-size: 26px;
  font-weight: 900;
  background: var(--bg);
}
.sum-c.y {
  border-color: var(--yellow);
}
.sum-c.y .sl {
  background: var(--yellow);
}
.sum-c.y .sv {
  color: var(--yellow);
}
.sum-c.g {
  border-color: var(--green);
}
.sum-c.g .sl {
  background: var(--green);
}
.sum-c.g .sv {
  color: var(--green);
}
.sum-c.b {
  border-color: var(--blue);
}
.sum-c.b .sl {
  background: var(--blue);
}
.sum-c.b .sv {
  color: var(--blue);
}
@media (max-width: 700px) {
  .lh {
    padding: 14px 16px;
  }
  .stage,
  .wide .stage {
    padding: 8px 16px 24px;
  }
}
</style>
