<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useApp } from '../stores/app.js'
import { ai, putJSON } from '../lib/api.js'
import AppShell from '../components/AppShell.vue'
import Icon from '../components/Icon.vue'
import ModelPicker from '../components/ModelPicker.vue'
import { play, playStep } from '../lib/sfx.js'

const SOUND_DEMO = [
  { id: 'correct', label: 'Dobrze' },
  { id: 'almost', label: 'Prawie' },
  { id: 'wrong', label: 'Źle' },
  { id: 'steps', label: 'Kroki kodu', fn: () => [0, 1, 2, 3, 4, 5].forEach((k) => setTimeout(() => playStep(k), k * 170)) },
  { id: 'flip', label: 'Fiszka' },
  { id: 'complete', label: 'Koniec lekcji' },
]

const app = useApp()
const router = useRouter()

const PROVIDERS = [
  {
    id: 'claude',
    name: 'Claude Code',
    desc: 'Używa CLI `claude` zalogowanego w ramach subskrypcji Claude (Pro/Max). Klucz ANTHROPIC_API_KEY jest ignorowany.',
  },
  {
    id: 'codex',
    name: 'Codex',
    desc: 'Używa CLI `codex exec` zalogowanego kontem ChatGPT. Klucz OPENAI_API_KEY jest ignorowany.',
  },
]

const testing = ref(false)
const testResult = ref(null)

async function saveNow() {
  await putJSON('/api/state', app.persisted())
}

async function choose(id) {
  if (app.settings.provider === id) return
  app.switchProvider(id)
  testResult.value = null
  await saveNow()
  app.refreshStatus()
}

function runSetup() {
  router.push('/setup')
}

async function saveBins() {
  await saveNow()
  await app.refreshStatus()
}

async function test() {
  testing.value = true
  testResult.value = null
  const t0 = Date.now()
  try {
    await saveNow()
    const data = await ai('ping', {})
    testResult.value = { ok: true, text: `${data.message} (${((Date.now() - t0) / 1000).toFixed(1)} s)` }
  } catch (err) {
    testResult.value = { ok: false, text: err.message }
  } finally {
    testing.value = false
  }
}

function newPlan() {
  router.push('/start')
}
function resetAll() {
  if (!confirm('Usunąć plan, postęp, XP, serię i wszystkie fiszki? Tego nie da się cofnąć.')) return
  app.resetAll()
  router.push('/start')
}
</script>

<template>
  <AppShell>
    <div class="content">
      <h1>Ustawienia</h1>

      <section class="sec">
        <h2>Silnik AI</h2>
        <p class="muted">Codenoms nie wysyła nic do chmury samodzielnie — uruchamia lokalne CLI, które korzysta z twojej subskrypcji. Zero płacenia za tokeny API.</p>
        <div class="providers">
          <button
            v-for="p in PROVIDERS"
            :key="p.id"
            class="card prov"
            :class="{ on: app.settings.provider === p.id }"
            :aria-pressed="app.settings.provider === p.id"
            @click="choose(p.id)"
          >
            <div class="ph">
              <strong>{{ p.name }}</strong>
              <span
                class="tag"
                :class="app.status?.providers?.[p.id]?.available ? 'tag-green' : 'tag-red'"
              >{{ app.status ? (app.status.providers?.[p.id]?.available ? 'znaleziono' : 'brak') : '…' }}</span>
            </div>
            <span class="pd">{{ p.desc }}</span>
            <code v-if="app.status?.providers?.[p.id]?.version" class="pv">{{ app.status.providers[p.id].version }}</code>
            <code v-if="app.status?.providers?.[p.id]?.path" class="pp" :title="app.status.providers[p.id].path">{{ app.status.providers[p.id].path }}</code>
          </button>
        </div>
      </section>

      <section class="sec">
        <h2>Model i effort — {{ app.settings.provider === 'codex' ? 'Codex' : 'Claude Code' }}</h2>
        <ModelPicker />
        <div class="row">
          <button class="btn btn-primary btn-sm" :disabled="testing" @click="test">
            <span v-if="testing" class="spinner" style="width: 16px; height: 16px; border-width: 2px; border-color: #ffffff55; border-top-color: #fff" />
            Testuj połączenie
          </button>
          <span v-if="testResult" class="tr" :class="testResult.ok ? 'ok' : 'bad'">
            <Icon :name="testResult.ok ? 'check' : 'x'" :size="18" :stroke="3" />{{ testResult.text }}
          </span>
        </div>
      </section>

      <section class="sec">
        <h2>Środowisko uruchomieniowe</h2>
        <div class="card dk">
          <div class="ph">
            <strong>Docker</strong>
            <span class="tag" :class="app.docker?.available ? 'tag-green' : 'tag-red'">
              {{ app.docker ? (app.docker.available ? `działa · ${app.docker.version}` : 'nie działa') : '…' }}
            </span>
          </div>
          <span class="pd">
            Zadania w PHP, C++, Pythonie, Go, Ruście, Javie, C# i SQL uruchamiają się w prawdziwych kontenerach:
            edytor z plikami, terminal (bash) i testy. Kontenery nie mają dostępu do sieci i mają limit pamięci. Obraz dla danego języka buduje się raz, przy pierwszym użyciu.
          </span>
          <span v-if="app.docker && !app.docker.available" class="pd warn">
            {{ app.docker.error || 'Docker nie odpowiada.' }} Bez Dockera zadania w tych językach ocenia tylko {{ app.settings.provider === 'codex' ? 'Codex' : 'Claude' }}.
          </span>
          <button class="btn btn-sm" style="align-self: flex-start" @click="app.refreshStatus()">Sprawdź ponownie</button>
        </div>
        <span class="label">JavaScript / TypeScript</span>
        <div class="seg">
          <button class="chip" :aria-pressed="app.settings.jsRuntime !== 'docker'" @click="app.settings.jsRuntime = 'browser'">W przeglądarce — szybko</button>
          <button class="chip" :aria-pressed="app.settings.jsRuntime === 'docker'" :disabled="!app.docker?.available" @click="app.settings.jsRuntime = 'docker'">
            W kontenerze — Node + terminal
          </button>
        </div>
        <span class="muted small">Dotyczy nowo generowanych lekcji.</span>
      </section>

      <section class="sec">
        <h2>Dźwięk</h2>
        <div class="row">
          <button class="chip" :aria-pressed="app.settings.sound !== false" @click="app.settings.sound = true; play('correct')">Włączony</button>
          <button class="chip" :aria-pressed="app.settings.sound === false" @click="app.settings.sound = false">Wyłączony</button>
          <label class="vol" :class="{ off: app.settings.sound === false }">
            <span class="label">Głośność</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              :value="app.settings.volume ?? 0.6"
              :disabled="app.settings.sound === false"
              @input="app.settings.volume = Number($event.target.value)"
              @change="play('pop')"
            />
          </label>
        </div>
        <div v-if="app.settings.sound !== false" class="row">
          <span class="label">Odsłuchaj:</span>
          <button v-for="s in SOUND_DEMO" :key="s.id" class="btn btn-sm" @click="s.fn ? s.fn() : play(s.id)">{{ s.label }}</button>
        </div>
      </section>

      <section class="sec">
        <h2>Ścieżki do CLI (opcjonalnie)</h2>
        <p class="muted">Zostaw puste, żeby wykrywać automatycznie (PATH, ~/.local/bin, rozszerzenia VS Code/Cursor, instalacja Codex).</p>
        <label class="label" for="cbin">Claude</label>
        <input id="cbin" v-model="app.settings.claudeBin" class="input mono" placeholder="np. C:\Users\…\claude.exe" @change="saveBins" />
        <label class="label" for="xbin">Codex</label>
        <input id="xbin" v-model="app.settings.codexBin" class="input mono" placeholder="np. C:\Users\…\codex.exe" @change="saveBins" />
      </section>

      <section class="sec danger">
        <h2>Dane</h2>
        <p class="muted">Wszystko jest zapisane lokalnie w <code>data/db.json</code> w katalogu projektu.</p>
        <div class="row">
          <button class="btn btn-sm" @click="runSetup()">Kreator konfiguracji</button>
          <button class="btn btn-sm" @click="newPlan">Ułóż nowy plan</button>
          <button class="btn btn-sm btn-ghost-red" @click="resetAll">Wyczyść wszystko</button>
        </div>
      </section>
    </div>
  </AppShell>
</template>

<style scoped>
.content {
  padding: 28px 32px 60px;
  max-width: 900px;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 28px;
}
h1 {
  font-size: 32px;
}
h2 {
  font-size: 20px;
}
.sec {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.sec p {
  margin: 0;
  line-height: 1.5;
  font-weight: 600;
}
.providers {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.prov {
  padding: 18px;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 8px;
  cursor: pointer;
  min-width: 0;
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
  font-size: 18px;
}
.pd {
  color: var(--text-3);
  font-weight: 600;
  font-size: 14px;
  line-height: 1.5;
}
.pv,
.pp {
  font-size: 12px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.seg {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.inline {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.row {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
.row .input {
  flex: 1;
  min-width: 200px;
}
.mono {
  font-family: var(--mono);
  font-size: 13px;
}
.dk {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.pd.warn {
  color: var(--yellow-light);
}
.small {
  font-size: 13px;
  font-weight: 700;
}
.vol {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: 8px;
}
.vol.off {
  opacity: 0.4;
}
.vol input {
  width: 160px;
  accent-color: var(--purple);
}
.tr {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
}
.tr.ok {
  color: var(--green-light);
}
.tr.bad {
  color: var(--red-light);
  font-family: var(--mono);
  font-size: 13px;
  white-space: pre-wrap;
}
@media (max-width: 760px) {
  .providers {
    grid-template-columns: 1fr;
  }
  .content {
    padding: 20px 16px 40px;
  }
}
</style>
