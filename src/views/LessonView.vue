<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { play } from '../lib/sfx.js'
import { useRoute, useRouter } from 'vue-router'
import { useApp } from '../stores/app.js'
import { ai } from '../lib/api.js'
import { firstSentence } from '../lib/markdown.js'
import CodeTrace from '../components/CodeTrace.vue'
import Icon from '../components/Icon.vue'
import Gem from '../components/Gem.vue'
import Markdown from '../components/Markdown.vue'
import LessonFooter from '../components/LessonFooter.vue'
import AskDrawer from '../components/AskDrawer.vue'
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
const gen = computed(() => app.lessonGen[id.value])
const exercises = computed(() => lesson.value?.exercises || [])
const providerName = computed(() => (app.settings.provider === 'codex' ? 'Codex' : 'Claude'))

const phase = ref('loading') // loading | error | play | summary
const loadError = ref('')
const idx = ref(0)
const answers = reactive({})
const results = reactive({})
const issues = reactive({})
const busy = ref(false)
const xp = ref(0)
const bonus = ref(0)
const startedAt = Date.now()
let timeCommitted = false

const ex = computed(() => exercises.value[idx.value])
const res = computed(() => (ex.value ? results[ex.value.id] : null))
const progress = computed(() => {
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
    phase.value = 'play'
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
    for (const k of Object.keys(results)) delete results[k]
    for (const k of Object.keys(issues)) delete issues[k]
    initAnswers()
    phase.value = 'play'
  } catch (err) {
    loadError.value = err.message
    phase.value = 'error'
  }
}

function initAnswers() {
  for (const e of exercises.value) {
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
  const e = ex.value
  if (e.type === 'choice') return checkChoice(e)
  if (e.type === 'open') return checkOpen(e)
  if (e.type === 'code') return checkCode(e)
}

function checkChoice(e) {
  const ok = answers[e.id] === e.correctIndex
  results[e.id] = { status: ok ? 'correct' : 'wrong' }
  nextTick(() => document.querySelector('.explain')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
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
    const allPass = run && !run.compileError && run.results.length && run.results.every((r) => r.ok)
    // przy niezweryfikowanych testach decyduje review modelu
    const testsOk = !run || allPass || e.testsStatus === 'unverified'
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

function retryCode() {
  // pozwala poprawić kod po review i sprawdzić ponownie
  if (results[ex.value.id]) results[ex.value.id] = { ...results[ex.value.id], retry: true }
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
  results[e.id] = { status: 'skipped' }
  if (!e.warmup) app.recordAnswer({ score: 0 })
}

/** Pytanie otwarte: uczciwe "nie wiem" — pokazujemy wzorcową odpowiedź i dodajemy ją do fiszek. */
function dontKnow() {
  const e = ex.value
  results[e.id] = { status: 'unknown' }
  app.recordAnswer({ score: 0 })
  app.addFlashcards([{ front: e.prompt, back: e.referenceAnswer }], `„nie wiem” w lekcji: ${meta.value?.title}`)
  nextTick(() => document.querySelector('.feedback')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
}

/** Karta wiedzy: "Znam to" pomija wszystkie kolejne karty wiedzy pod rząd. */
function knowIt() {
  let j = idx.value
  while (j < exercises.value.length && exercises.value[j].type === 'learn') j++
  window.scrollTo({ top: 0 })
  if (j >= exercises.value.length) return finish()
  idx.value = j
}

// ------------------------------------------------------------- prześledzenie kodu

const showTrace = ref(false)
const traceState = reactive({}) // exId -> { loading, chars, error }

async function openTrace() {
  const e = ex.value
  if (!e?.code) return explainInChat()
  showTrace.value = true
  window.scrollTo({ top: 0 })
  if (e.trace || traceState[e.id]?.loading) return
  traceState[e.id] = { loading: true, chars: 0, error: null }
  try {
    const data = await ai('trace', { exercise: e, chosenIndex: answers[e.id] }, { onProgress: (p) => (traceState[e.id].chars = p.chars) })
    if (!data?.steps?.length) throw new Error('Model nie zwrócił kroków')
    e.trace = data // zapisuje się razem z lekcją
    traceState[e.id].loading = false
  } catch (err) {
    traceState[e.id] = { loading: false, chars: 0, error: err.message }
  }
}

function retryTrace() {
  delete traceState[ex.value.id]
  openTrace()
}

function next() {
  if (ex.value?.type === 'learn') play('pop', 1.2)
  showTrace.value = false
  drawerOpen.value = false
  drawer.value?.reset()
  window.scrollTo({ top: 0 })
  if (idx.value < exercises.value.length - 1) {
    idx.value++
  } else {
    finish()
  }
}

function finish() {
  const graded = exercises.value.filter((e) => e.type !== 'learn' && !e.warmup)
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

// ------------------------------------------------------------- stopka

const footer = computed(() => {
  const r = res.value
  if (!r || codeRetrying.value) return { tone: 'idle' }
  const e = ex.value
  if (r.status === 'error') return { tone: 'wrong', title: 'Coś poszło nie tak', message: r.error }
  if (r.status === 'skipped') return { tone: 'skipped', title: 'Pominięto', message: '' }
  if (r.status === 'unknown') return { tone: 'skipped', title: 'Nic straconego', message: 'Przeczytaj wzorcową odpowiedź — dodałem ją do fiszek.' }
  if (e.type === 'choice' && e.warmup) {
    return r.status === 'correct'
      ? { tone: 'correct', title: 'Dobra intuicja!', message: 'Zobaczmy, dlaczego tak jest.' }
      : { tone: 'almost', title: 'Dobra próba!', message: 'To rozgrzewka — za chwilę wszystko się wyjaśni.' }
  }
  if (e.type === 'choice') {
    const short = e.trace?.headline || firstSentence(e.explanation)
    return r.status === 'correct'
      ? { tone: 'correct', title: 'Świetnie!', message: short }
      : { tone: 'wrong', title: 'Niepoprawnie', message: short }
  }
  const titles = { correct: 'Świetnie!', almost: 'Prawie!', wrong: 'Jeszcze nie' }
  return { tone: r.status, title: titles[r.status], message: r.data?.headline || '' }
})

// ------------------------------------------------------------- dopytaj

const drawer = ref(null)
const drawerOpen = ref(false)
const drawerContext = computed(() => {
  const e = ex.value
  if (!e) return ''
  const a = answers[e.id]
  const r = res.value
  const parts = [`Lekcja: ${meta.value?.title} (${meta.value?.module?.title})`, `Typ ćwiczenia: ${e.type}`]
  if (e.type === 'learn') {
    parts.push(`Karta wiedzy: ${e.title}\n${e.prompt}${e.code ? `\n\nPrzykład:\n\`\`\`\n${e.code}\n\`\`\`` : ''}\n\nPułapka: ${e.explanation}`)
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
  setTimeout(() => drawer.value?.explain({ exercise: ex.value, chosenIndex: answers[ex.value.id] }), 0)
}

// ------------------------------------------------------------- klawiatura

function onKey(e) {
  if (phase.value !== 'play' || drawerOpen.value) return
  const t = e.target
  const typing = t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.closest?.('.monaco-editor'))
  if (e.key === 'Enter' && (!typing || e.ctrlKey || e.metaKey)) {
    if (ex.value?.type === 'learn' || (res.value && !codeRetrying.value)) {
      e.preventDefault()
      next()
    } else if (canCheck.value && ex.value.type !== 'code') {
      e.preventDefault()
      check()
    }
  }
  if (!typing && ex.value?.type === 'choice' && !res.value) {
    const n = Number(e.key)
    if (n >= 1 && n <= ex.value.options.length) answers[ex.value.id] = n - 1
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

const wide = computed(() => ex.value?.type === 'code')
const loadingTips = [
  'Lekcje generują się na bieżąco pod twoje słabe punkty.',
  'Następna lekcja przygotowuje się w tle, gdy robisz tę.',
  'Błędy trafiają do fiszek — wrócą w powtórce.',
  'Enter = sprawdź / dalej. Klawisze 1–4 wybierają odpowiedź.',
]
const tip = loadingTips[Math.floor(Math.random() * loadingTips.length)]
</script>

<template>
  <div class="lesson" :class="{ wide, tracing: showTrace }">
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
    <main v-else-if="ex" class="stage">
      <div class="inner" :key="ex.id">
        <LearnCard v-if="ex.type === 'learn'" :exercise="ex" />
        <OpenExercise
          v-else-if="ex.type === 'open'"
          v-model="answers[ex.id]"
          :exercise="ex"
          :result="res"
          :busy="busy"
          @submit="check"
        />
        <template v-else-if="ex.type === 'choice' && showTrace">
          <button class="link-btn back" @click="showTrace = false"><Icon name="arrow-left" :size="16" />Wróć do pytania</button>
          <CodeTrace v-if="ex.trace" :exercise="ex" :trace="ex.trace" :chosen-index="answers[ex.id]" />
          <div v-else-if="traceState[ex.id]?.error" class="card trace-wait">
            <strong style="color: var(--red-light)">Nie udało się przygotować prześledzenia</strong>
            <span class="err">{{ traceState[ex.id].error }}</span>
            <button class="btn btn-sm btn-primary" @click="retryTrace">Spróbuj ponownie</button>
          </div>
          <div v-else class="card trace-wait">
            <span class="spinner" />
            <span>{{ providerName }} śledzi wykonanie kodu… <span class="muted mono">{{ traceState[ex.id]?.chars || 0 }} zn</span></span>
          </div>
        </template>
        <ChoiceExercise v-else-if="ex.type === 'choice'" v-model="answers[ex.id]" :exercise="ex" :result="res" @trace="openTrace" />
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

    <LessonFooter v-if="phase === 'summary'" tone="idle">
      <template #left>
        <RouterLink v-if="app.dueCards.length" to="/review" class="btn btn-ghost">Fiszki ({{ app.dueCards.length }})</RouterLink>
      </template>
      <RouterLink to="/path" class="btn btn-primary btn-lg">Dalej</RouterLink>
    </LessonFooter>

    <LessonFooter v-else-if="phase === 'play' && ex" :tone="footer.tone" :title="footer.title" :message="footer.message">
      <template #message>
        <Markdown v-if="footer.message" :src="footer.message" />
      </template>
      <template #left>
        <template v-if="ex.type === 'learn'">
          <button class="btn btn-ghost" @click="knowIt">Znam to — pomiń</button>
          <button class="btn btn-ghost" @click="openAsk"><Icon name="chat" :size="18" />Dopytaj</button>
        </template>
        <template v-else>
          <button v-if="ex.type === 'open'" class="btn btn-ghost" :disabled="busy" @click="dontKnow">Nie wiem</button>
          <button v-else class="btn btn-ghost" :disabled="busy" @click="skip">Pomiń</button>
          <button v-if="ex.type !== 'choice'" class="btn btn-ghost" :disabled="busy" @click="openAsk">
            <Icon name="chat" :size="18" />Podpowiedź
          </button>
        </template>
      </template>

      <!-- karta wiedzy -->
      <template v-if="ex.type === 'learn'">
        <button class="btn btn-green btn-lg" @click="next">Rozumiem</button>
      </template>

      <!-- przed sprawdzeniem -->
      <template v-else-if="footer.tone === 'idle'">
        <button v-if="busy" class="btn btn-primary btn-lg" disabled><span class="spinner" style="border-color: #ffffff55; border-top-color: #fff" />Sprawdzam…</button>
        <button v-else class="btn btn-lg" :class="canCheck ? (ex.type === 'code' ? 'btn-primary' : 'btn-green') : ''" :disabled="!canCheck" @click="check">
          {{ ex.type === 'code' ? `Sprawdź z ${providerName}` : ex.type === 'open' ? 'Sprawdź' : 'Sprawdź' }}
        </button>
      </template>

      <!-- po sprawdzeniu -->
      <template v-else>
        <template v-if="footer.tone === 'correct'">
          <button v-if="ex.type === 'choice' && ex.code && !ex.warmup && !showTrace" class="btn btn-ghost-green" @click="openTrace">Prześledź kod</button>
          <button class="btn btn-ghost-green" @click="openAsk">Dopytaj {{ providerName }}</button>
          <button class="btn btn-green btn-lg" @click="next">Dalej</button>
        </template>
        <template v-else-if="footer.tone === 'almost'">
          <button v-if="ex.type === 'code'" class="btn btn-ghost-yellow" @click="retryCode">Poprawię kod</button>
          <button class="btn btn-ghost-yellow" @click="openAsk">Dopytaj {{ providerName }}</button>
          <button class="btn btn-yellow btn-lg" @click="next">Dalej</button>
        </template>
        <template v-else-if="footer.tone === 'wrong'">
          <button v-if="res?.status === 'error'" class="btn btn-ghost-red" @click="results[ex.id] = undefined">Spróbuj ponownie</button>
          <button v-else-if="ex.type === 'choice' && !showTrace" class="btn btn-ghost-red" @click="openTrace">Wyjaśnij krok po kroku</button>
          <button v-else-if="ex.type === 'code'" class="btn btn-ghost-red" @click="retryCode">Poprawię kod</button>
          <button v-if="(ex.type !== 'choice' || showTrace) && res?.status !== 'error'" class="btn btn-ghost-red" @click="openAsk">Dopytaj {{ providerName }}</button>
          <button class="btn btn-red btn-lg" @click="next">Rozumiem</button>
        </template>
        <template v-else>
          <button class="btn btn-primary btn-lg" @click="next">Dalej</button>
        </template>
      </template>
    </LessonFooter>

    <AskDrawer ref="drawer" :open="drawerOpen" :context="drawerContext" @close="drawerOpen = false" />
  </div>
</template>

<style scoped>
.lesson {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
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
