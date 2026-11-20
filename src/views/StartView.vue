<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useApp } from '../stores/app.js'
import Logo from '../components/Logo.vue'
import Gem from '../components/Gem.vue'
import Icon from '../components/Icon.vue'
import ProviderPill from '../components/ProviderPill.vue'

const app = useApp()
const router = useRouter()

const MAX = 2000
const description = ref(app.profile?.description || '')
const minutes = ref(app.profile?.minutesPerDay || 30)
const style = ref(app.profile?.style || 'code')

const TEMPLATES = [
  {
    label: 'Przygotowanie do rozmowy',
    text: 'Pracuję jako senior frontend developer z Reactem i TypeScriptem. Przed rozmowami chcę odświeżyć event loop, domknięcia, hoisting i this. Pokaż mi te mechanizmy na przykładach z pracy frontendowej, a po przećwiczeniu tematu daj mi pytanie w stylu rozmowy.',
  },
  {
    label: 'Nowy język: Go / Rust',
    text: 'Znam dobrze JavaScript/TypeScript i backend w Node. Chcę szybko wejść w Go (albo Rust): składnia, typy, obsługa błędów, współbieżność, idiomy. Wolę uczyć się przez porównania do JS i krótkie zadania.',
  },
  {
    label: 'Algorytmy i struktury danych',
    text: 'Pracuję komercyjnie kilka lat, ale algorytmy mam zardzewiałe. Chcę odświeżyć: złożoność, tablice/hash mapy, dwa wskaźniki, sliding window, rekurencję, drzewa, grafy (BFS/DFS), DP. Zadania w JavaScript.',
  },
  {
    label: 'System design',
    text: 'Jestem mid/senior backend developerem. Chcę podciągnąć system design: skalowanie, cache, kolejki, bazy SQL vs NoSQL, spójność, rate limiting, projektowanie API. Pytania otwarte + krótkie zadania z kodem tam, gdzie ma to sens (TypeScript).',
  },
  {
    label: 'TypeScript zaawansowany',
    text: 'Używam TypeScriptu na co dzień, ale głównie podstaw. Chcę opanować: generyki, conditional types, mapped types, infer, template literal types, narrowing, typy narzędziowe, projektowanie typów bibliotek.',
  },
]
const MINUTES = [15, 30, 45, 60]
const STYLES = [
  { id: 'code', label: 'Więcej kodu' },
  { id: 'balanced', label: 'Balans' },
  { id: 'theory', label: 'Teoria' },
]

const ready = computed(() => description.value.trim().length >= 20)
const available = computed(() => app.activeProvider?.available)
const running = computed(() => app.gen.status === 'running')

function start() {
  if (!ready.value || running.value) return
  app.generatePlan({ description: description.value.trim(), minutesPerDay: minutes.value, style: style.value })
  router.push('/plan')
}
</script>

<template>
  <div class="page">
    <Gem class="deco deco-g" :index="2" :size="96" glow />
    <Gem class="deco deco-r" :index="0" :size="72" glow />

    <header class="head">
      <Logo />
      <ProviderPill />
    </header>

    <main class="wrap">
      <div class="col">
        <div class="intro">
          <div class="steps">
            <div class="bar"><div style="width: 50%" /></div>
            <span class="label">Krok 1 / 2</span>
          </div>
          <h1>Czego chcesz się nauczyć?</h1>
          <p class="lead">
            Napisz, co chcesz umieć, z jakimi technologiami pracujesz i które pojęcia chcesz poznać lub odświeżyć.
          </p>
        </div>

        <div v-if="app.plan" class="warn">
          Masz już plan „{{ app.plan.title }}”. Nowy plan go zastąpi — XP, seria i fiszki zostają.
          <RouterLink to="/path">Wróć do ścieżki</RouterLink>
        </div>

        <div class="group">
          <label for="goal" class="label">Twoja sytuacja</label>
          <div class="box">
            <textarea
              id="goal"
              v-model="description"
              rows="7"
              :maxlength="MAX"
              placeholder="np. Jestem senior frontend devem (8 lat, React + TS). Przed rozmowami chcę odświeżyć fundamenty JS: event loop, closures, hoisting… Mam 30–45 min dziennie i wolę krótkie zadania z kodem."
              @keydown.ctrl.enter="start"
            />
            <div class="box-foot">
              <span>Im więcej szczegółów, tym lepszy plan</span>
              <span>{{ description.length }} / {{ MAX }}</span>
            </div>
          </div>
        </div>

        <div class="group">
          <span class="label">Albo zacznij od szablonu</span>
          <div class="chips">
            <button v-for="t in TEMPLATES" :key="t.label" class="chip tpl" @click="description = t.text">{{ t.label }}</button>
          </div>
        </div>

        <div class="grid2">
          <div class="group">
            <span class="label" id="lbl-min">Czas dziennie</span>
            <div class="seg" role="group" aria-labelledby="lbl-min">
              <button v-for="m in MINUTES" :key="m" class="chip" :aria-pressed="minutes === m" @click="minutes = m">
                {{ m === 60 ? '60+' : m }} min
              </button>
            </div>
          </div>
          <div class="group">
            <span class="label" id="lbl-style">Styl nauki</span>
            <div class="seg" role="group" aria-labelledby="lbl-style">
              <button v-for="s in STYLES" :key="s.id" class="chip" :aria-pressed="style === s.id" @click="style = s.id">{{ s.label }}</button>
            </div>
          </div>
        </div>

        <div class="cta">
          <span class="hint">
            <template v-if="available === false">
              Nie widzę CLI {{ app.settings.provider === 'codex' ? 'Codex' : 'Claude Code' }}.
              <RouterLink to="/settings">Skonfiguruj w Ustawieniach</RouterLink>.
            </template>
            <template v-else>Na podstawie opisu powstanie plan z przykładami, ćwiczeniami i powtórkami.</template>
          </span>
          <button class="btn btn-primary btn-lg" :disabled="!ready || running" @click="start">
            <Icon name="sparkle" :size="20" :stroke="2.4" />
            Wygeneruj plan
          </button>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}
.deco {
  position: absolute;
  pointer-events: none;
}
.deco-g {
  right: 7%;
  top: 140px;
  transform: rotate(12deg);
}
.deco-r {
  left: 6%;
  bottom: 120px;
  transform: rotate(-14deg);
}
.head {
  display: flex;
  flex-wrap: wrap;
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
  padding: 48px 16px 40px;
}
.col {
  width: 100%;
  max-width: 760px;
  display: flex;
  flex-direction: column;
  gap: 28px;
  position: relative;
}
.intro {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.steps {
  display: flex;
  align-items: center;
  gap: 12px;
}
.steps .bar {
  height: 14px;
}
h1 {
  margin-top: 8px;
  font-size: clamp(32px, 5vw, 44px);
  line-height: 1.1;
  letter-spacing: -0.02em;
}
.lead {
  margin: 0;
  font-size: 18px;
  line-height: 1.5;
  color: var(--text-3);
}
.warn {
  background: var(--yellow-bg);
  border: 2px solid var(--yellow-border);
  color: var(--yellow-light);
  border-radius: 14px;
  padding: 12px 16px;
  font-weight: 700;
}
.warn a {
  color: var(--yellow);
  margin-left: 6px;
}
.group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.box {
  background: var(--surface);
  border: 2px solid var(--purple);
  border-bottom-width: 5px;
  border-radius: 20px;
  padding: 6px;
}
.box textarea {
  width: 100%;
  resize: vertical;
  background: transparent;
  border: none;
  color: var(--text);
  font-size: 17px;
  line-height: 1.6;
  padding: 14px 16px;
  outline: none;
}
.box textarea::placeholder {
  color: #6e777e;
}
.box-foot {
  display: flex;
  justify-content: space-between;
  padding: 6px 12px 8px;
  font-size: 13px;
  color: var(--muted);
  font-weight: 600;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.tpl {
  color: var(--text);
  border-radius: 14px;
  font-weight: 700;
}
.grid2 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.seg {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.seg .chip {
  flex: 1;
  padding: 10px 0;
  min-width: 70px;
}
.cta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-top: 8px;
}
.hint {
  font-size: 15px;
  color: var(--muted);
  font-weight: 600;
  max-width: 380px;
}
@media (max-width: 700px) {
  .grid2 {
    grid-template-columns: 1fr;
  }
  .head {
    padding: 14px 16px;
  }
  .deco {
    display: none;
  }
  .cta .btn {
    width: 100%;
  }
}
</style>
