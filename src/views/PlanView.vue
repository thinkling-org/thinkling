<script setup>
import { t, uiLocale } from '../lib/i18n.js'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useApp } from '../stores/app.js'
import Logo from '../components/Logo.vue'
import Gem from '../components/Gem.vue'
import Icon from '../components/Icon.vue'
import ProviderPill from '../components/ProviderPill.vue'

const app = useApp()
const router = useRouter()

const running = computed(() => app.gen.status === 'running')
const failed = computed(() => app.gen.status === 'error')
const view = computed(() => (running.value ? app.gen.partial || {} : app.plan || {}))
const modules = computed(() => (view.value.modules || []).filter((m) => m && m.title))
const lessonCount = computed(() => modules.value.reduce((a, m) => a + (m.lessons?.length || 0), 0))
const isFirstPlan = computed(() => !app.plan)
const KIND = {
  theory: { label: t('pytania'), icon: 'question' },
  output: { label: 'output', icon: 'terminal' },
  code: { label: t('zadania'), icon: 'code' },
  mixed: { label: t('mix'), icon: 'mixed' },
  design: { label: t('projekt'), icon: 'design' },
  test: { label: 'test', icon: 'trophy' },
}

function moduleSummary(m) {
  const counts = {}
  for (const l of m.lessons || []) if (l?.kind) counts[l.kind] = (counts[l.kind] || 0) + 1
  const parts = Object.entries(counts).map(([k, n]) => (k === 'code' ? t('{0} × zadania', [n]) : KIND[k]?.label || k))
  return [t('{0} lekcji', [m.lessons?.length || 0]), ...parts].join(' · ')
}

const steps = computed(() => {
  const p = app.gen.partial || {}
  const mods = (p.modules || []).filter((m) => m?.title)
  const s1 = !!(p.goal || p.level)
  const s2 = mods.length > 0
  const done = app.gen.status === 'done'
  return [
    { title: t('Analiza opisu'), sub: p.goal ? t('Cel: {0}', [p.goal]) : t('Czytam, czego chcesz się nauczyć'), state: s1 || done ? 'done' : 'active' },
    { title: t('Ocena poziomu'), sub: p.level ? `${p.level}${p.levelSummary ? ' · ' + p.levelSummary : ''}` : t('Szukam luk'), state: s2 || done ? 'done' : s1 ? 'active' : 'todo' },
    { title: t('Układanie modułów'), sub: s2 ? t('{0} gotowe', [mods.length]) : t('W kolejce'), state: done ? 'done' : s2 ? 'active' : 'todo' },
    { title: t('Pierwsza lekcja i fiszki'), sub: done ? t('Gotowe') : t('W kolejce'), state: done ? 'done' : 'todo' },
  ]
})

const expanded = ref(new Set())
function toggle(i) {
  const s = new Set(expanded.value)
  s.has(i) ? s.delete(i) : s.add(i)
  expanded.value = s
}

const feedback = ref('')
async function refine() {
  const f = feedback.value.trim()
  if (!f || running.value) return
  feedback.value = ''
  await app.refinePlan(f)
}

function retry() {
  if (app.gen.mode === 'refinePlan' || !app.profile) {
    app.gen.status = app.plan ? 'done' : 'idle'
    if (!app.plan) router.push('/start')
    return
  }
  app.generatePlan(app.profile)
}

function go() {
  app.prefetchNext()
  router.push('/path')
}

const secs = computed(() => Math.round((app.gen.elapsed || 0) / 1000))
</script>

<template>
  <div class="page">
    <header class="head">
      <Logo />
      <ProviderPill :busy="running" :label="running ? t('{0} generuje…', [app.settings.provider === 'codex' ? 'Codex' : 'Claude']) : ''">
        <span v-if="running" class="tok">{{ app.gen.chars.toLocaleString(uiLocale()) }} {{ t('zn ·') }} {{ secs }} s</span>
      </ProviderPill>
    </header>

    <main class="wrap">
      <section class="left">
        <template v-if="running || (isFirstPlan && !failed)">
          <div class="progress">
            <div class="bar"><div :style="{ width: running ? `${50 + Math.min(45, modules.length * 8)}%` : '100%' }" /></div>
            <span class="label">{{ t('Krok 2 / 2') }}</span>
          </div>
          <h1>{{ app.gen.mode === 'refinePlan' ? t('Poprawiam twój plan') : t('Układam twój plan treningowy') }}</h1>
          <div class="steps">
            <div
              v-for="s in steps"
              :key="s.title"
              class="step"
              :class="[s.state, s.state === 'todo' ? 'card-dashed' : 'card']"
            >
              <span v-if="s.state === 'done'" class="ok"><Icon name="check" :size="16" :stroke="3.5" /></span>
              <span v-else-if="s.state === 'active'" class="spinner" />
              <span v-else class="todo-dot" />
              <div>
                <div class="st">{{ s.title }}</div>
                <div class="ss">{{ s.sub }}</div>
              </div>
            </div>
          </div>
        </template>

        <template v-else-if="app.plan">
          <span class="label" style="color: var(--purple-link)">{{ t('Twój poziom') }}</span>
          <h1>{{ app.plan.level }}</h1>
          <p class="sum">{{ app.plan.levelSummary }}</p>
          <div class="card meta">
            <span class="label">{{ t('Cel') }}</span>
            <p>{{ app.plan.goal }}</p>
            <span class="label">{{ t('Słabe punkty') }}</span>
            <div class="tags">
              <span v-for="w in app.weakSpots" :key="w" class="tag tag-red">{{ w }}</span>
              <span v-if="!app.weakSpots.length" class="muted">{{ t('Brak — świetnie!') }}</span>
            </div>
          </div>
        </template>

        <div v-if="failed" class="card err">
          <strong>{{ t('Nie udało się') }} {{ app.gen.mode === 'refinePlan' ? t('poprawić') : t('wygenerować') }} {{ t('planu') }}</strong>
          <p>{{ app.gen.error }}</p>
          <div class="row">
            <button class="btn btn-sm btn-primary" @click="retry">{{ app.gen.mode === 'refinePlan' ? 'OK' : t('Spróbuj ponownie') }}</button>
            <RouterLink to="/settings" class="btn btn-sm">{{ t('Ustawienia') }}</RouterLink>
          </div>
        </div>

        <form v-if="app.plan || running" class="refine" @submit.prevent="refine">
          <label for="refine" class="label">{{ t('Popraw plan') }}</label>
          <div class="refine-box">
            <input id="refine" v-model="feedback" :disabled="running" :placeholder="t('np. więcej async, mniej teorii, dodaj testy')" autocomplete="off" />
            <button type="submit" :aria-label="t('Wyślij poprawkę')" :disabled="running || !feedback.trim()">
              <Icon name="send" :size="18" :stroke="2.4" />
            </button>
          </div>
        </form>
      </section>

      <section class="right">
        <div class="card hero">
          <div class="hero-t">
            <span class="label" style="color: var(--purple-link)">{{ t('Twój plan') }}</span>
            <span class="title">{{ view.title || (running ? t('Generuję…') : '—') }}</span>
            <span v-if="view.summary" class="hero-sum">{{ view.summary }}</span>
          </div>
          <div class="kpis">
            <div><div class="k">{{ view.durationWeeks ? t('{0} tyg.', [view.durationWeeks]) : '–' }}</div><div class="label">{{ t('Czas trwania') }}</div></div>
            <div><div class="k">{{ modules.length || '–' }}</div><div class="label">{{ t('Modułów') }}</div></div>
            <div><div class="k">{{ lessonCount || '–' }}</div><div class="label">{{ t('Lekcji') }}</div></div>
          </div>
        </div>

        <div class="mods">
          <div v-for="(m, i) in modules" :key="i" class="card mod" :class="{ open: expanded.has(i) }">
            <button class="mod-head" :aria-expanded="expanded.has(i)" @click="toggle(i)">
              <Gem :index="i" :size="44" />
              <div class="mod-t">
                <span class="label sm">{{ t('Moduł') }} {{ i + 1 }}<template v-if="m.week"> {{ t('· Tydzień') }} {{ m.week }}</template></span>
                <span class="mt">{{ m.title }}</span>
                <span class="ms">{{ moduleSummary(m) }}</span>
              </div>
              <span v-if="!running && m.lessons" class="mod-prog">
                {{ m.lessons.filter((l) => l.status === 'done').length }}/{{ m.lessons.length }}
              </span>
            </button>
            <div v-if="expanded.has(i)" class="lessons">
              <p v-if="m.description" class="mdesc">{{ m.description }}</p>
              <div v-for="(l, li) in m.lessons || []" :key="li" class="lesson" :class="l.status">
                <span class="li-ic"><Icon :name="KIND[l.kind]?.icon || 'mixed'" :size="16" /></span>
                <div>
                  <div class="lt">{{ l.title }}</div>
                  <div class="lf">{{ l.focus }}</div>
                </div>
                <RouterLink v-if="l.status === 'done' || l.status === 'current'" :to="`/lesson/${l.id}`" class="btn btn-sm">
                  {{ l.status === 'done' ? t('Powtórz') : 'Start' }}
                </RouterLink>
              </div>
            </div>
          </div>
          <div v-if="running" class="card-dashed mod skeleton">
            <div class="sk-gem" />
            <div class="sk-lines"><div style="width: 40%" /><div style="width: 75%; height: 14px" /><div style="width: 55%" /></div>
          </div>
        </div>

        <div class="actions">
          <RouterLink to="/start" class="btn">{{ app.plan ? t('Nowy plan') : t('Wróć') }}</RouterLink>
          <button v-if="app.plan" class="btn btn-primary btn-lg" :disabled="running" @click="go">
            {{ app.doneCount ? t('Do ścieżki') : t('Zaczynamy') }}
          </button>
        </div>
      </section>
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
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  padding: 20px 32px;
  border-bottom: 2px solid var(--divider);
}
.tok {
  color: var(--muted);
  font-family: var(--mono);
  font-weight: 500;
  font-size: 13px;
}
.wrap {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 32px;
  padding: 40px 32px;
  max-width: 1280px;
  width: 100%;
  margin: 0 auto;
}
.left {
  flex: 1 1 320px;
  max-width: 380px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.right {
  flex: 999 1 560px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.progress {
  display: flex;
  align-items: center;
  gap: 12px;
}
.progress .bar {
  height: 14px;
}
h1 {
  font-size: 36px;
  line-height: 1.1;
  letter-spacing: -0.02em;
}
.sum {
  margin: 0;
  color: var(--text-3);
  font-size: 16px;
  line-height: 1.5;
  font-weight: 600;
}
.steps {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.step {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  padding: 14px 16px;
  border-radius: 16px;
}
.step.active {
  border-color: var(--purple);
}
.ok {
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--green);
  color: var(--green-ink);
  display: grid;
  place-items: center;
}
.step .spinner {
  width: 28px;
  height: 28px;
}
.todo-dot {
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 3px solid var(--border);
}
.st {
  font-weight: 800;
  font-size: 16px;
}
.step.todo .st {
  color: var(--muted);
}
.ss {
  font-size: 14px;
  color: var(--muted);
  font-weight: 600;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.step.active .ss {
  color: var(--purple-link);
  font-weight: 700;
}
.meta {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.meta p {
  margin: 0 0 8px;
  font-weight: 600;
  color: var(--text-2);
  line-height: 1.5;
}
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.err {
  padding: 16px;
  border-color: var(--red-border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.err strong {
  color: var(--red-light);
}
.err p {
  margin: 0;
  color: var(--text-3);
  font-family: var(--mono);
  font-size: 13px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.row {
  display: flex;
  gap: 8px;
}
.refine {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.refine-box {
  display: flex;
  gap: 8px;
  background: var(--surface);
  border: 2px solid var(--border);
  border-radius: 14px;
  padding: 6px 6px 6px 14px;
  align-items: center;
}
.refine-box:focus-within {
  border-color: var(--purple);
}
.refine-box input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  font-size: 15px;
  font-weight: 600;
  outline: none;
}
.refine-box button {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 10px;
  background: var(--border);
  display: grid;
  place-items: center;
  cursor: pointer;
}
.refine-box button:not(:disabled):hover {
  background: var(--purple);
}
.refine-box button:disabled {
  opacity: 0.5;
  cursor: default;
}
.hero {
  padding: 24px;
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  align-items: center;
  justify-content: space-between;
}
.hero-t {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  flex: 1 1 300px;
}
.title {
  font-size: 26px;
  font-weight: 900;
}
.hero-sum {
  color: var(--text-3);
  font-weight: 600;
  line-height: 1.5;
}
.kpis {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
}
.k {
  font-size: 24px;
  font-weight: 900;
}
.mods {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  align-items: start;
}
.mod {
  padding: 0;
  overflow: hidden;
}
.mod.open {
  grid-column: 1 / -1;
}
.mod-head {
  width: 100%;
  display: flex;
  gap: 14px;
  padding: 18px;
  background: none;
  border: none;
  text-align: left;
  cursor: pointer;
  align-items: flex-start;
}
.mod-t {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  flex: 1;
}
.label.sm {
  font-size: 12px;
}
.mt {
  font-size: 18px;
  font-weight: 800;
}
.ms {
  font-size: 14px;
  color: var(--muted);
  font-weight: 600;
}
.mod-prog {
  font-weight: 900;
  color: var(--muted);
  font-size: 14px;
}
.lessons {
  border-top: 2px solid var(--divider);
  padding: 12px 18px 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.mdesc {
  margin: 0 0 6px;
  color: var(--text-3);
  font-weight: 600;
  line-height: 1.5;
}
.lesson {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 8px 0;
}
.lesson > div {
  flex: 1;
  min-width: 0;
}
.li-ic {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--border);
  display: grid;
  place-items: center;
  color: var(--muted);
  flex: none;
}
.lesson.done .li-ic {
  background: var(--green);
  color: var(--green-ink);
}
.lesson.current .li-ic {
  background: var(--purple);
  color: #fff;
}
.lt {
  font-weight: 800;
}
.lf {
  font-size: 13px;
  color: var(--muted);
  font-weight: 600;
}
.skeleton {
  display: flex;
  gap: 14px;
  padding: 18px;
  animation: dl-pulse 1.6s ease-in-out infinite;
}
.sk-gem {
  flex: none;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--border);
}
.sk-lines {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 4px;
}
.sk-lines div {
  height: 10px;
  background: var(--border);
  border-radius: 6px;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: flex-end;
  padding-top: 8px;
}
@media (max-width: 760px) {
  .mods {
    grid-template-columns: 1fr;
  }
  .wrap {
    padding: 24px 16px;
  }
  .head {
    padding: 14px 16px;
  }
  .left {
    max-width: none;
  }
}
</style>
