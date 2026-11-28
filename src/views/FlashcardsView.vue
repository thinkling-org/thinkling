<script setup lang="ts">
import { t } from '../lib/i18n.ts'
import { computed, ref } from 'vue'
import { useApp } from '../stores/app.ts'
import { formatDelay } from '../lib/srs.ts'
import AppShell from '../components/AppShell.vue'
import Gem from '../components/Gem.vue'
import Icon from '../components/Icon.vue'
import Markdown from '../components/Markdown.vue'
import { UiButton, UiChoiceGroup, UiInput } from '../components/ui/index.ts'

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
  return d <= 0 ? t('now') : t('in {0}', [formatDelay(d)])
}
function firstLine(md) {
  return md.replace(/```[\s\S]*?```/g, t('[code]')).split('\n').find((l) => l.trim()) || ''
}
</script>

<template>
  <AppShell>
    <div class="content">
      <section class="hero card">
        <Gem :index="3" :size="64" />
        <div class="ht">
          <h1>{{ t('Flashcards') }}</h1>
          <p>{{ t('Spaced repetition brings back lesson concepts and mistakes before you forget them.') }}</p>
        </div>
        <div class="kpis">
          <div><div class="k" style="color: var(--red-light)">{{ app.dueCards.length }}</div><div class="label">{{ t('Due for review') }}</div></div>
          <div><div class="k">{{ app.flashcards.length }}</div><div class="label">{{ t('In the deck') }}</div></div>
          <div><div class="k" style="color: var(--green)">{{ learned }}</div><div class="label">{{ t('Learned') }}</div></div>
        </div>
        <div class="acts">
          <UiButton variant="primary" size="lg" to="/review" :class="{ disabled: !app.dueCards.length }">
            {{ app.dueCards.length ? t('Review {0}', [app.dueCards.length]) : t('Nothing to review') }}
          </UiButton>
          <UiButton v-if="app.flashcards.length" :to="{ path: '/review', query: { all: 1 } }">{{ t('Practice all') }}</UiButton>
        </div>
      </section>

      <div class="toolbar">
        <UiChoiceGroup
          v-model="filter"
          :options="[
            { value: 'all', label: t('All') },
            { value: 'due', label: t('Due for review') },
            { value: 'hard', label: t('Hard') },
          ]"
          :label="t('Filter')"
        />
        <UiInput v-model="q" class="search" :placeholder="t('Search…')" :aria-label="t('Search flashcards')" />
      </div>

      <div v-if="!cards.length" class="empty card-dashed">
        {{ app.flashcards.length ? t('No flashcards match this filter.') : t('Your deck is empty. Flashcards will appear after your first lesson.') }}
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
              <span class="muted small">{{ c.source }} {{ t('· reviews:') }} {{ c.reps }} {{ t('· mistakes:') }} {{ c.lapses }}</span>
              <UiButton variant="ghost-red" size="sm" @click="app.deleteCard(c.id)"><Icon name="trash" :size="16" />{{ t('Delete') }}</UiButton>
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
