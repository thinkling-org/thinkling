<script setup>
import { computed, ref } from 'vue'
import { useApp } from '../stores/app.js'
import { formatDelay } from '../lib/srs.js'
import AppShell from '../components/AppShell.vue'
import Gem from '../components/Gem.vue'
import Icon from '../components/Icon.vue'
import Markdown from '../components/Markdown.vue'

const app = useApp()
const filter = ref('all')
const q = ref('')
const openId = ref(null)

const cards = computed(() => {
  const now = Date.now()
  let list = [...app.flashcards]
  if (filter.value === 'due') list = list.filter((c) => c.due <= now)
  if (filter.value === 'hard') list = list.filter((c) => c.lapses > 0 || c.ease < 2.3)
  if (q.value.trim()) {
    const s = q.value.toLowerCase()
    list = list.filter((c) => (c.front + c.back).toLowerCase().includes(s))
  }
  return list.sort((a, b) => a.due - b.due)
})
const learned = computed(() => app.flashcards.filter((c) => c.interval >= 4).length)
function dueText(c) {
  const d = c.due - Date.now()
  return d <= 0 ? 'teraz' : `za ${formatDelay(d)}`
}
function firstLine(md) {
  return md.replace(/```[\s\S]*?```/g, '[kod]').split('\n').find((l) => l.trim()) || ''
}
</script>

<template>
  <AppShell>
    <div class="content">
      <section class="hero card">
        <Gem :index="3" :size="64" />
        <div class="ht">
          <h1>Fiszki</h1>
          <p>Powtórki rozłożone w czasie: pojęcia z lekcji i twoje błędy wracają, zanim zdążysz je zapomnieć.</p>
        </div>
        <div class="kpis">
          <div><div class="k" style="color: var(--red-light)">{{ app.dueCards.length }}</div><div class="label">Do powtórki</div></div>
          <div><div class="k">{{ app.flashcards.length }}</div><div class="label">W talii</div></div>
          <div><div class="k" style="color: var(--green)">{{ learned }}</div><div class="label">Utrwalone</div></div>
        </div>
        <div class="acts">
          <RouterLink to="/review" class="btn btn-primary btn-lg" :class="{ disabled: !app.dueCards.length }">
            {{ app.dueCards.length ? `Powtórz ${app.dueCards.length}` : 'Nic do powtórki' }}
          </RouterLink>
          <RouterLink v-if="app.flashcards.length" :to="{ path: '/review', query: { all: 1 } }" class="btn">Ćwicz wszystkie</RouterLink>
        </div>
      </section>

      <div class="toolbar">
        <div class="seg" role="group" aria-label="Filtr">
          <button class="chip" :aria-pressed="filter === 'all'" @click="filter = 'all'">Wszystkie</button>
          <button class="chip" :aria-pressed="filter === 'due'" @click="filter = 'due'">Do powtórki</button>
          <button class="chip" :aria-pressed="filter === 'hard'" @click="filter = 'hard'">Trudne</button>
        </div>
        <input v-model="q" class="input search" placeholder="Szukaj…" aria-label="Szukaj fiszek" />
      </div>

      <div v-if="!cards.length" class="empty card-dashed">
        {{ app.flashcards.length ? 'Brak fiszek dla tego filtra.' : 'Talia jest pusta — fiszki pojawią się po pierwszej lekcji.' }}
      </div>

      <div class="list">
        <div v-for="c in cards" :key="c.id" class="card item" :class="{ open: openId === c.id }">
          <button class="ih" :aria-expanded="openId === c.id" @click="openId = openId === c.id ? null : c.id">
            <span class="dot" :class="{ due: c.due <= Date.now() }" />
            <span class="f">{{ firstLine(c.front) }}</span>
            <span class="d">{{ dueText(c) }}</span>
          </button>
          <div v-if="openId === c.id" class="ib">
            <Markdown :src="c.front" />
            <div class="sep" />
            <Markdown :src="c.back" class="back" />
            <div class="ifoot">
              <span class="muted small">{{ c.source }} · powtórki: {{ c.reps }} · pomyłki: {{ c.lapses }}</span>
              <button class="btn btn-sm btn-ghost-red" @click="app.deleteCard(c.id)"><Icon name="trash" :size="16" />Usuń</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </AppShell>
</template>

<style scoped>
.content {
  padding: 28px 32px 60px;
  max-width: 1000px;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.hero {
  padding: 24px;
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  align-items: center;
}
.ht {
  flex: 1 1 280px;
}
.ht h1 {
  font-size: 30px;
}
.ht p {
  margin: 6px 0 0;
  color: var(--text-3);
  font-weight: 600;
  line-height: 1.5;
}
.kpis {
  display: flex;
  gap: 24px;
}
.k {
  font-size: 26px;
  font-weight: 900;
}
.acts {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  width: 100%;
  justify-content: flex-end;
}
.disabled {
  opacity: 0.5;
  pointer-events: none;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: space-between;
}
.seg {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.search {
  max-width: 280px;
}
.empty {
  padding: 24px;
  text-align: center;
  color: var(--muted);
  font-weight: 700;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.item {
  border-radius: 16px;
  overflow: hidden;
}
.ih {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: none;
  border: none;
  text-align: left;
  cursor: pointer;
  font-weight: 700;
}
.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--border);
  flex: none;
}
.dot.due {
  background: var(--red);
}
.f {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.d {
  color: var(--muted);
  font-size: 13px;
  white-space: nowrap;
}
.ib {
  padding: 4px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.sep {
  height: 2px;
  background: var(--border);
}
.back {
  color: var(--text-2);
}
.ifoot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.small {
  font-size: 13px;
  font-weight: 700;
}
@media (max-width: 860px) {
  .content {
    padding: 20px 16px 40px;
  }
}
</style>
