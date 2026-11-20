<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useApp } from '../stores/app.js'
import { ai, getJSON, putJSON } from '../lib/api.js'
import Logo from '../components/Logo.vue'
import Icon from '../components/Icon.vue'
import ModelPicker from '../components/ModelPicker.vue'
import JobLog from '../components/JobLog.vue'

const app = useApp()
const router = useRouter()
const route = useRoute()

const STEPS = [
  { id: 'welcome', title: 'Witaj' },
  { id: 'ai', title: 'Silnik AI' },
  { id: 'docker', title: 'Docker' },
  { id: 'voice', title: 'Głos lektora' },
  { id: 'dictation', title: 'Dyktowanie' },
  { id: 'done', title: 'Gotowe' },
]
const POPULAR = ['python', 'javascript', 'cpp', 'go', 'java']

const step = ref(Math.max(0, STEPS.findIndex((s) => s.id === route.query.step)))
const status = ref(null)
const jobs = ref({})
const loading = ref(false)
const copied = ref('')
const startError = ref('')
const languages = ref([])
const testing = ref(false)
const testResult = ref(null)
const skipped = ref({ voice: false, dictation: false })
let poll = null

const current = computed(() => STEPS[step.value].id)
const docker = computed(() => status.value?.docker)
const providers = computed(() => status.value?.providers || {})
const activeProvider = computed(() => providers.value[app.settings.provider])
const providerReady = computed(() => !!activeProvider.value?.available && activeProvider.value?.auth?.loggedIn !== false)
const anyRunning = computed(() => Object.values(jobs.value).some((j) => j?.status === 'running'))

async function loadStatus() {
  loading.value = true
  try {
    status.value = await getJSON('/api/setup/status')
    jobs.value = status.value.jobs || {}
    if (status.value.sandbox && !languages.value.length) {
      languages.value = POPULAR.filter((l) => status.value.sandbox[l] && !status.value.sandbox[l].ready)
    }
  } finally {
    loading.value = false
  }
  if (anyRunning.value) startPolling()
}

async function recheck() {
  await fetch('/api/setup/refresh', { method: 'POST' }).catch(() => {})
  await loadStatus()
  app.refreshStatus()
}

function startPolling() {
  if (poll) return
  poll = setInterval(async () => {
    const before = anyRunning.value
    try {
      jobs.value = await getJSON('/api/setup/jobs')
    } catch {}
    if (before && !anyRunning.value) {
      clearInterval(poll)
      poll = null
      await recheck()
    }
  }, 1000)
}

async function startJob(kind, body) {
  startError.value = ''
  try {
    const res = await fetch(`/api/setup/jobs/${kind}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || res.status)
    jobs.value = { ...jobs.value, [kind]: data }
    startPolling()
  } catch (err) {
    startError.value = err.message
  }
}

const job = (kind) => jobs.value?.[kind] || null
const running = (kind) => job(kind)?.status === 'running'

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = text
    setTimeout(() => copied.value === text && (copied.value = ''), 1500)
  } catch {}
}

async function chooseProvider(id) {
  app.switchProvider(id)
  testResult.value = null
  await putJSON('/api/state', app.persisted())
  app.refreshStatus()
}

async function test() {
  testing.value = true
  testResult.value = null
  const t0 = Date.now()
  try {
    await putJSON('/api/state', app.persisted())
    const data = await ai('ping', {})
    testResult.value = { ok: true, text: `${data.message} (${((Date.now() - t0) / 1000).toFixed(1)} s)` }
  } catch (err) {
    testResult.value = { ok: false, text: err.message }
  } finally {
    testing.value = false
  }
}

function toggleLang(l) {
  languages.value = languages.value.includes(l) ? languages.value.filter((x) => x !== l) : [...languages.value, l]
}

function next() {
  if (step.value < STEPS.length - 1) step.value++
}
function back() {
  if (step.value > 0) step.value--
}
function skip(kind) {
  skipped.value[kind] = true
  next()
}

async function finish() {
  app.settings.setupDone = true
  await putJSON('/api/state', app.persisted())
  await app.refreshStatus()
  router.push(app.plan ? '/path' : '/start')
}

const summary = computed(() => {
  const s = status.value
  if (!s) return []
  const p = activeProvider.value
  return [
    {
      label: `Silnik AI: ${app.settings.provider === 'codex' ? 'Codex' : 'Claude Code'}${app.settings.model ? ` · ${app.settings.model}` : ''}${app.settings.effort ? ` · ${app.settings.effort}` : ''}`,
      ok: providerReady.value,
      note: !p?.available ? 'nie znaleziono CLI' : p?.auth?.loggedIn === false ? 'niezalogowane' : '',
    },
    { label: 'Docker (piaskownica z terminalem)', ok: !!s.docker?.running, note: s.docker?.running ? '' : 'zadania w PHP, C++ itd. oceni tylko model' },
    { label: 'Głos lektora (ZONOS3-Mini)', ok: !!s.voice?.running, note: s.voice?.running ? '' : 'możesz zainstalować później w Ustawieniach' },
    { label: 'Dyktowanie (Faster Whisper)', ok: !!s.dictation?.installed, note: s.dictation?.installed ? '' : 'możesz zainstalować później w Ustawieniach' },
  ]
})

onMounted(loadStatus)
onBeforeUnmount(() => clearInterval(poll))
</script>

<template>
  <div class="page">
    <header class="head">
      <Logo />
      <span class="label">Konfiguracja · krok {{ step + 1 }} / {{ STEPS.length }}</span>
    </header>

    <main class="wrap">
      <div class="col">
        <nav class="dots" aria-label="Kroki konfiguracji">
          <button
            v-for="(s, i) in STEPS"
            :key="s.id"
            class="dot"
            :class="{ on: i === step, past: i < step }"
            :aria-current="i === step ? 'step' : undefined"
            @click="step = i"
          >
            <span class="n">{{ i < step ? '✓' : i + 1 }}</span>
            <span class="t">{{ s.title }}</span>
          </button>
        </nav>

        <div v-if="!status && current !== 'welcome'" class="card box center">
          <span class="spinner" /> Sprawdzam, co jest zainstalowane…
        </div>

        <!-- ------------------------------------------------------- powitanie -->
        <section v-else-if="current === 'welcome'" class="card box">
          <h1>Cześć! Przygotujmy DevLingo</h1>
          <p class="lead">
            DevLingo działa w całości na Twoim komputerze. Zanim zaczniesz, kreator sprawdzi kilka rzeczy i pomoże doinstalować brakujące elementy:
          </p>
          <ul class="list">
            <li><strong>Silnik AI</strong>: Claude Code albo Codex, zalogowany Twoją subskrypcją (wymagany).</li>
            <li><strong>Docker</strong>: prawdziwe środowiska z terminalem dla PHP, C++, Pythona, Go i innych (zalecany).</li>
            <li><strong>Głos lektora</strong>: lokalny model, który czyta lekcje na głos (opcjonalny, ok. 1,7 GB).</li>
            <li><strong>Dyktowanie</strong>: odpowiedzi mówione do mikrofonu, rozpoznawane lokalnie (opcjonalne, ok. 0,5 GB).</li>
          </ul>
          <p class="muted">Każdy krok możesz pominąć i wrócić do niego później w Ustawieniach.</p>
        </section>

        <!-- ------------------------------------------------------- silnik AI -->
        <section v-else-if="current === 'ai'" class="card box">
          <h1>Silnik AI</h1>
          <p class="lead">Wybierz, z którego CLI ma korzystać DevLingo. Używana jest Twoja subskrypcja, więc nie płacisz za tokeny API.</p>
          <div class="providers">
            <button
              v-for="id in ['claude', 'codex']"
              :key="id"
              class="card prov"
              :class="{ on: app.settings.provider === id }"
              :aria-pressed="app.settings.provider === id"
              @click="chooseProvider(id)"
            >
              <div class="ph">
                <strong>{{ id === 'claude' ? 'Claude Code' : 'Codex' }}</strong>
                <span v-if="!providers[id]?.available" class="tag tag-red">brak CLI</span>
                <span v-else-if="providers[id].auth?.loggedIn === false" class="tag tag-yellow">niezalogowane</span>
                <span v-else class="tag tag-green">gotowe</span>
              </div>
              <span class="pd">{{ id === 'claude' ? 'Subskrypcja Claude Pro / Max' : 'Konto ChatGPT (Plus / Pro / Business)' }}</span>
              <code v-if="providers[id]?.version" class="pv">{{ providers[id].version }}</code>
            </button>
          </div>

          <div v-if="activeProvider && !activeProvider.available" class="hint">
            <strong>Zainstaluj {{ app.settings.provider === 'claude' ? 'Claude Code' : 'Codex' }}</strong> w terminalu, a potem kliknij „Sprawdź ponownie”:
            <div class="cmd"><code>{{ activeProvider.install }}</code><button class="btn btn-sm" @click="copy(activeProvider.install)">{{ copied === activeProvider.install ? 'Skopiowano' : 'Kopiuj' }}</button></div>
            <span class="muted small">Jeśli CLI jest zainstalowane w nietypowym miejscu, podasz ścieżkę później w Ustawieniach.</span>
          </div>
          <div v-else-if="activeProvider?.auth?.loggedIn === false" class="hint">
            <strong>Zaloguj się</strong> w terminalu (otworzy się przeglądarka), a potem kliknij „Sprawdź ponownie”:
            <div class="cmd"><code>{{ activeProvider.login }}</code><button class="btn btn-sm" @click="copy(activeProvider.login)">{{ copied === activeProvider.login ? 'Skopiowano' : 'Kopiuj' }}</button></div>
          </div>

          <ModelPicker v-if="activeProvider?.available" :key="app.settings.provider" />

          <div class="row">
            <button class="btn btn-sm" :disabled="loading" @click="recheck"><Icon name="refresh" :size="16" /> Sprawdź ponownie</button>
            <button v-if="activeProvider?.available" class="btn btn-primary btn-sm" :disabled="testing" @click="test">
              <span v-if="testing" class="spinner sm" /> Testuj połączenie
            </button>
            <span v-if="testResult" class="tr" :class="testResult.ok ? 'ok' : 'bad'">
              <Icon :name="testResult.ok ? 'check' : 'x'" :size="18" :stroke="3" />{{ testResult.text }}
            </span>
          </div>
        </section>

        <!-- ------------------------------------------------------- Docker -->
        <section v-else-if="current === 'docker'" class="card box">
          <h1>Docker</h1>
          <p class="lead">
            Dzięki Dockerowi zadania w PHP, C++, Pythonie, Go, Ruście, Javie, C#, Ruby i SQL uruchamiają się w prawdziwych, odizolowanych kontenerach z terminalem.
            Głos lektora też działa w Dockerze.
          </p>

          <div class="statusline">
            <span class="tag" :class="docker.running ? 'tag-green' : 'tag-red'">
              {{ docker.running ? `Docker działa · ${docker.version}${docker.endpoint ? ` · ${docker.endpoint}` : ''}` : docker.problem === 'permission' ? 'brak uprawnień' : docker.installed ? 'zainstalowany, ale nie działa' : 'nie zainstalowany' }}
            </span>
          </div>

          <template v-if="!docker.running">
            <div v-if="docker.problem === 'permission'" class="hint">
              <strong>Docker działa, ale Twoje konto nie ma do niego dostępu.</strong> Wykonaj w terminalu:
              <div v-for="c in docker.help.permission" :key="c" class="cmd"><code>{{ c }}</code><button v-if="!c.startsWith('Wyloguj')" class="btn btn-sm" @click="copy(c)">{{ copied === c ? 'Skopiowano' : 'Kopiuj' }}</button></div>
            </div>
            <div v-else-if="!docker.installed" class="hint">
              <strong>Zainstaluj Dockera.</strong>
              <template v-if="docker.help.autoInstall">
                DevLingo może zrobić to za Ciebie. System poprosi o hasło administratora.
                <button class="btn btn-primary btn-sm self" :disabled="anyRunning" @click="startJob('docker-install')">Zainstaluj Dockera</button>
                <span class="muted small">Albo ręcznie, w terminalu:</span>
              </template>
              <template v-else>Wykonaj w terminalu:</template>
              <div v-for="c in docker.help.install" :key="c" class="cmd"><code>{{ c }}</code><button class="btn btn-sm" @click="copy(c)">{{ copied === c ? 'Skopiowano' : 'Kopiuj' }}</button></div>
              <a class="link small" :href="docker.help.link" target="_blank" rel="noopener">Oficjalna instrukcja instalacji ↗</a>
            </div>
            <div v-else class="hint">
              <strong>Uruchom Dockera.</strong>
              <button v-if="docker.help.autoStart" class="btn btn-primary btn-sm self" :disabled="anyRunning" @click="startJob('docker-start')">Uruchom Dockera</button>
              <div v-for="c in docker.help.start" :key="c" class="cmd"><code>{{ c }}</code><button v-if="!c.startsWith('Uruchom')" class="btn btn-sm" @click="copy(c)">{{ copied === c ? 'Skopiowano' : 'Kopiuj' }}</button></div>
            </div>
          </template>

          <JobLog v-for="k in ['docker-install', 'docker-start']" :key="k" :job="job(k)" />

          <template v-if="docker.running && status.sandbox">
            <span class="label">Przygotuj środowiska z góry (opcjonalnie)</span>
            <span class="muted small">Inaczej obraz danego języka zbuduje się przy pierwszej lekcji, co zajmuje 1–3 min.</span>
            <div class="seg">
              <button
                v-for="(env, l) in status.sandbox"
                :key="l"
                class="chip"
                :class="{ ready: env.ready }"
                :aria-pressed="!env.ready && languages.includes(l)"
                :disabled="env.ready || running('sandbox')"
                @click="toggleLang(l)"
              >{{ env.label }}{{ env.ready ? ' ✓' : '' }}</button>
            </div>
            <button
              class="btn btn-sm self"
              :disabled="!languages.length || running('sandbox')"
              @click="startJob('sandbox', { languages })"
            >Pobierz wybrane ({{ languages.length }})</button>
            <JobLog :job="job('sandbox')" />
          </template>

          <div class="row">
            <button class="btn btn-sm" :disabled="loading" @click="recheck"><Icon name="refresh" :size="16" /> Sprawdź ponownie</button>
          </div>
        </section>

        <!-- ------------------------------------------------------- głos -->
        <section v-else-if="current === 'voice'" class="card box">
          <h1>Głos lektora</h1>
          <p class="lead">
            Zainstalować lokalny głos AI? Przycisk <strong>Przeczytaj</strong> odczyta wtedy po polsku karty wiedzy i wyjaśnienia.
            Model mowy <strong>ZONOS3-Mini</strong> działa na procesorze, bez internetu i bez wysyłania tekstu do chmury.
          </p>
          <ul class="list small">
            <li>Pobranie: ok. {{ (status.voice.downloadMB / 1000).toFixed(1).replace('.', ',') }} GB wag modelu z Hugging Face.</li>
            <li>Jednorazowa kompilacja serwera w Dockerze: zwykle 5–20 minut.</li>
            <li>Później serwer startuje sam, razem z Dockerem, i zajmuje ok. 1,5 GB RAM.</li>
          </ul>

          <div class="statusline">
            <span class="tag" :class="status.voice.running ? 'tag-green' : 'tag-yellow'">
              {{ status.voice.running ? 'Głos działa' : status.voice.modelsReady ? 'Modele pobrane, serwer nie działa' : 'Nie zainstalowany' }}
            </span>
          </div>

          <div v-if="!docker.running && !status.voice.running" class="hint warn">
            Głos wymaga Dockera. Wróć do poprzedniego kroku, żeby go uruchomić, albo pomiń ten krok.
          </div>

          <div class="row">
            <button
              v-if="!status.voice.running"
              class="btn btn-primary"
              :disabled="!docker.running || running('voice')"
              @click="startJob('voice')"
            >
              <span v-if="running('voice')" class="spinner sm" />
              {{ running('voice') ? 'Instaluję…' : job('voice')?.status === 'error' ? 'Spróbuj ponownie' : 'Tak, zainstaluj głos' }}
            </button>
            <button v-if="!status.voice.running && !running('voice')" class="btn" @click="skip('voice')">Nie teraz</button>
          </div>
          <JobLog :job="job('voice')" />
          <span v-if="running('voice')" class="muted small">Możesz przejść dalej. Instalacja będzie trwać w tle.</span>
        </section>

        <!-- ------------------------------------------------------- dyktowanie -->
        <section v-else-if="current === 'dictation'" class="card box">
          <h1>Dyktowanie</h1>
          <p class="lead">
            Wolisz mówić niż pisać? Z dyktowaniem odpowiesz na pytania otwarte głosem (mikrofon przy polu tekstowym albo <kbd>Alt+Shift+M</kbd>).
            Mowę rozpoznaje lokalnie <strong>Faster Whisper</strong>.
          </p>
          <ul class="list small">
            <li>Pobranie: ok. {{ status.dictation.downloadMB }} MB (model „small” + biblioteki Pythona).</li>
            <li>
              Wymaga Pythona 3.10–3.13:
              <span v-if="status.dictation.python && status.dictation.pythonTested" class="ok-text">znaleziono {{ status.dictation.python }}</span>
              <span v-else-if="status.dictation.python" class="warn-text">znaleziono {{ status.dictation.python }}: nowsza wersja niż sprawdzone, instalacja może się nie udać (wtedy doinstaluj Pythona 3.12 lub 3.13)</span>
              <span v-else class="bad-text">nie znaleziono, zainstaluj z <a class="link" href="https://www.python.org/downloads/" target="_blank" rel="noopener">python.org</a></span>
            </li>
          </ul>
          <div class="statusline">
            <span class="tag" :class="status.dictation.installed ? 'tag-green' : 'tag-yellow'">{{ status.dictation.installed ? 'Dyktowanie gotowe' : 'Nie zainstalowane' }}</span>
          </div>
          <div class="row">
            <button
              v-if="!status.dictation.installed"
              class="btn btn-primary"
              :disabled="!status.dictation.python || running('dictation')"
              @click="startJob('dictation')"
            >
              <span v-if="running('dictation')" class="spinner sm" />
              {{ running('dictation') ? 'Instaluję…' : job('dictation')?.status === 'error' ? 'Spróbuj ponownie' : 'Tak, zainstaluj dyktowanie' }}
            </button>
            <button v-if="!status.dictation.installed && !running('dictation')" class="btn" @click="skip('dictation')">Nie teraz</button>
          </div>
          <JobLog :job="job('dictation')" />
        </section>

        <!-- ------------------------------------------------------- gotowe -->
        <section v-else class="card box">
          <h1>Wszystko gotowe</h1>
          <ul class="summary">
            <li v-for="s in summary" :key="s.label">
              <Icon :name="s.ok ? 'check' : 'x'" :size="18" :stroke="3" :class="s.ok ? 'ok-text' : 'bad-text'" />
              <span>{{ s.label }}<span v-if="s.note" class="muted"> · {{ s.note }}</span></span>
            </li>
          </ul>
          <div v-if="anyRunning" class="hint">Instalacja wciąż trwa w tle. Możesz już zacząć naukę, a funkcja włączy się, gdy instalacja się skończy.</div>
          <div v-if="!providerReady" class="hint warn">Bez działającego silnika AI DevLingo nie ułoży planu ani lekcji. Wróć do kroku „Silnik AI”.</div>
        </section>

        <p v-if="startError" class="tr bad">{{ startError }}</p>

        <footer v-if="status || current === 'welcome'" class="nav">
          <button v-if="step > 0" class="btn" @click="back"><Icon name="arrow-left" :size="18" /> Wstecz</button>
          <span class="grow" />
          <button v-if="current !== 'done'" class="btn btn-primary" @click="next">
            {{ current === 'welcome' ? 'Zaczynamy' : 'Dalej' }} <Icon name="arrow-right" :size="18" />
          </button>
          <button v-else class="btn btn-green btn-lg" :disabled="!providerReady" @click="finish">Przejdź do nauki</button>
        </footer>
      </div>
    </main>
  </div>
</template>

<style scoped>
.page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.head {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  padding: 20px 32px;
  border-bottom: 2px solid var(--divider);
}
.wrap {
  flex: 1;
  display: flex;
  justify-content: center;
  padding: 36px 16px 48px;
}
.col {
  width: 100%;
  max-width: 780px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.dots {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.dot {
  display: flex;
  align-items: center;
  gap: 8px;
  background: none;
  border: 0;
  color: var(--faint);
  font: inherit;
  font-weight: 800;
  font-size: 14px;
  cursor: pointer;
  padding: 6px 10px 6px 6px;
  border-radius: 999px;
}
.dot .n {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  border: 2px solid var(--border);
  font-size: 13px;
}
.dot.past {
  color: var(--text-3);
}
.dot.past .n {
  background: var(--green-soft);
  border-color: var(--green-border);
  color: var(--green-light);
}
.dot.on {
  color: var(--text);
  background: var(--surface);
}
.dot.on .n {
  border-color: var(--purple);
  background: var(--purple-soft);
  color: var(--purple-light);
}
.box {
  padding: 28px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.box.center {
  flex-direction: row;
  align-items: center;
  font-weight: 700;
}
h1 {
  font-size: 28px;
  margin: 0;
}
.lead {
  margin: 0;
  line-height: 1.55;
  font-weight: 600;
  color: var(--text-2);
}
.list {
  margin: 0;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  line-height: 1.5;
  color: var(--text-2);
}
.providers {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.prov {
  padding: 16px;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 6px;
  cursor: pointer;
  min-width: 0;
  font: inherit;
  color: inherit;
}
.prov.on {
  border-color: var(--purple);
  background: var(--purple-soft);
}
.ph {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  font-size: 17px;
}
.pd {
  color: var(--text-3);
  font-weight: 600;
  font-size: 14px;
}
.pv {
  font-size: 12px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hint {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  border-radius: 14px;
  background: var(--surface-2);
  border: 2px solid var(--border);
  line-height: 1.5;
  font-weight: 600;
}
.hint.warn {
  background: var(--yellow-bg);
  border-color: var(--yellow-border);
  color: var(--yellow-light);
}
.cmd {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--bg-deep);
  border: 2px solid var(--border);
  border-radius: 10px;
  padding: 6px 6px 6px 12px;
}
.cmd code {
  flex: 1;
  font-family: var(--mono);
  font-size: 13px;
  color: var(--code-ink);
  overflow-x: auto;
  white-space: nowrap;
}
.self {
  align-self: flex-start;
}
.seg {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.row {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
.chip.ready,
.chip.ready:disabled {
  background: var(--green-soft);
  border-color: var(--green-border);
  color: var(--green-light);
  opacity: 1;
}
.statusline {
  display: flex;
  gap: 8px;
}
.small {
  font-size: 13px;
  font-weight: 700;
}
.link {
  color: var(--purple-link);
}
.spinner.sm {
  width: 16px;
  height: 16px;
  border-width: 2px;
}
.tr {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
  margin: 0;
}
.tr.ok,
.ok-text {
  color: var(--green-light);
}
.warn-text {
  color: var(--yellow-light);
}
.tr.bad,
.bad-text {
  color: var(--red-light);
}
.tr.bad {
  font-family: var(--mono);
  font-size: 13px;
  white-space: pre-wrap;
}
.summary {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-weight: 700;
}
.summary li {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.nav {
  display: flex;
  align-items: center;
  gap: 10px;
}
.grow {
  flex: 1;
}
kbd {
  font-family: var(--mono);
  font-size: 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 1px 6px;
}
@media (max-width: 640px) {
  .providers {
    grid-template-columns: 1fr;
  }
  .head {
    padding: 16px;
  }
  .box {
    padding: 20px 16px;
  }
  .dot .t {
    display: none;
  }
}
</style>
