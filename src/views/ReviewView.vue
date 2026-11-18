<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useApp } from '../stores/app.js'
import { RATINGS, formatDelay, schedule } from '../lib/srs.js'
import { play } from '../lib/sfx.js'
import Icon from '../components/Icon.vue'
import Gem from '../components/Gem.vue'
import Markdown from '../components/Markdown.vue'

const app = useApp()
const router = useRouter()
const route = useRoute()

// "?all=1" → ćwicz całą talię, nawet jeśli nic nie jest "due"
const queue = ref(
  (route.query.all ? [...app.flashcards] : [...app.dueCards])
    .sort((a, b) => a.due - b.due)
    .slice(0, 30)
    .map((c) => c.id),
)
const total = ref(queue.value.length)
const doneCount = ref(0)
const revealed = ref(false)
const stats = ref({ again: 0, hard: 0, good: 0, easy: 0 })
const startedAt = Date.now()

const card = computed(() => app.flashcards.find((c) => c.id === queue.value[0]))
const finished = computed(() => !queue.value.length)

const previews = computed(() => {
  if (!card.value) return {}
  const now = Date.now()
  return Object.fromEntries(RATINGS.map((r) => [r.id, formatDelay(schedule(card.value, r.id, now).due - now)]))
})

function rate(rating) {
  if (!card.value || !revealed.value) return
  const id = card.value.id
  ;({ again: () => play('pop', 0.7), hard: () => play('almost'), good: () => play('correct'), easy: () => play('correct') })[rating]()
  if (queue.value.length === 1 && rating !== 'again') setTimeout(() => play('complete'), 350)
  app.rateCard(id, rating)
  stats.value[rating]++
  queue.value.shift()
  if (rating === 'again') queue.value.push(id) // wraca jeszcze w tej sesji
  else doneCount.value++
  revealed.value = false
}

watch(revealed, (r) => {
  if (!r) return
  play('flip')
  nextTick(() => document.querySelector('.rate')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
})

function onKey(e) {
  if (finished.value) return
  if ((e.key === ' ' || e.key === 'Enter') && !revealed.value) {
    e.preventDefault()
    revealed.value = true
    return
  }
  const n = Number(e.key)
  if (revealed.value && n >= 1 && n <= 4) rate(RATINGS[n - 1].id)
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  if (doneCount.value) app.addTime(Math.min((Date.now() - startedAt) / 1000, 3600))
})
</script>

<template>
  <div class="review">
    <header class="rh">
      <button class="x" aria-label="Zamknij" @click="router.back()"><Icon name="x" :size="26" :stroke="2.8" /></button>
      <div class="bar"><div :style="{ width: `${total ? (doneCount / total) * 100 : 100}%` }" /></div>
      <span class="count">{{ doneCount }} / {{ total }}</span>
    </header>

    <main v-if="!total" class="center">
      <Gem :index="3" :size="96" glow />
      <h1>Brak fiszek do powtórki</h1>
      <p class="sub">Fiszki dodają się po lekcjach i z twoich błędów. Wróć później!</p>
      <div class="row">
        <RouterLink to="/path" class="btn">Do ścieżki</RouterLink>
        <RouterLink v-if="app.flashcards.length" :to="{ path: '/review', query: { all: 1 } }" class="btn btn-primary">Ćwicz całą talię</RouterLink>
      </div>
    </main>

    <main v-else-if="finished" class="center">
      <Gem :index="2" :size="110" glow class="pop" />
      <h1 class="done">Powtórka zrobiona!</h1>
      <div class="sum">
        <span class="tag tag-red">Znowu: {{ stats.again }}</span>
        <span class="tag tag-yellow">Trudne: {{ stats.hard }}</span>
        <span class="tag tag-green">Dobrze: {{ stats.good }}</span>
        <span class="tag tag-purple">Łatwe: {{ stats.easy }}</span>
      </div>
      <RouterLink to="/path" class="btn btn-primary btn-lg" style="margin-top: 16px">Dalej</RouterLink>
    </main>

    <main v-else-if="card" class="stage">
      <div class="inner">
        <div class="meta">
          <span v-if="card.source" class="tag" :class="/bł[ąę]d/.test(card.source) ? 'tag-red' : 'tag-purple'">{{ card.source }}</span>
          <span v-if="card.lapses" class="muted small">pomyłki: {{ card.lapses }}</span>
        </div>
        <div class="stack">
          <div aria-hidden="true" class="ghost g2" />
          <div aria-hidden="true" class="ghost g1" />
          <article class="fc card" :key="card.id">
            <div class="side">
              <span class="label">Pytanie</span>
              <Markdown class="front" :src="card.front" />
            </div>
            <template v-if="revealed">
              <div class="sep" />
              <div class="side">
                <span class="label" style="color: var(--green)">Odpowiedź</span>
                <Markdown class="back" :src="card.back" />
              </div>
            </template>
          </article>
        </div>

        <div v-if="!revealed" class="reveal">
          <button class="btn btn-primary btn-lg btn-block" @click="revealed = true">Pokaż odpowiedź</button>
          <span class="muted small">Spacja</span>
        </div>
        <div v-else class="rate">
          <span class="rq">Jak dobrze to pamiętałeś?</span>
          <div class="rgrid">
            <button v-for="(r, i) in RATINGS" :key="r.id" class="rbtn" :class="r.tone" @click="rate(r.id)">
              <span class="rl">{{ r.label }}</span>
              <span class="rt">{{ previews[r.id] }} · {{ i + 1 }}</span>
            </button>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.review {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.rh {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 24px 32px;
  max-width: 1100px;
  width: 100%;
  margin: 0 auto;
}
.x {
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  padding: 4px;
  display: grid;
}
.x:hover {
  color: var(--text);
}
.count {
  font-weight: 900;
  font-size: 16px;
  color: var(--muted);
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
.done {
  color: var(--yellow);
  font-size: 38px;
}
.sub {
  margin: 0;
  color: var(--text-3);
  font-weight: 600;
}
.row,
.sum {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: center;
}
.pop {
  animation: dl-pop 0.5s ease-out;
}
.stage {
  flex: 1;
  display: flex;
  justify-content: center;
  padding: 24px;
}
.inner {
  width: 100%;
  max-width: 680px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  min-height: 28px;
}
.small {
  font-size: 13px;
  font-weight: 700;
}
.stack {
  position: relative;
  padding-bottom: 20px;
}
.ghost {
  position: absolute;
  height: 60px;
  border-radius: 24px;
  bottom: 0;
}
.g2 {
  left: 32px;
  right: 32px;
  background: #1a1d21;
  border: 2px solid #262b30;
}
.g1 {
  left: 16px;
  right: 16px;
  bottom: 10px;
  background: #1b1f23;
  border: 2px solid #2a2f34;
}
.fc {
  position: relative;
  border-radius: 24px;
  border-bottom-width: 6px;
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 22px;
  animation: dl-pop 0.22s ease-out;
}
.side {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.front {
  font-size: 26px;
  line-height: 1.3;
  font-weight: 900;
}
.front :deep(pre) {
  font-size: 15px;
  font-weight: 500;
}
.back {
  font-size: 18px;
  color: #e4e8eb;
}
.sep {
  height: 2px;
  background: var(--border);
}
.reveal {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.rate {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.rq {
  text-align: center;
  font-size: 15px;
  font-weight: 800;
  color: var(--muted);
}
.rgrid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
.rbtn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  background: var(--surface);
  border: 2px solid;
  border-bottom-width: 5px;
  border-radius: 16px;
  padding: 14px 8px;
  cursor: pointer;
}
.rbtn:active {
  transform: translateY(2px);
}
.rl {
  font-weight: 900;
  font-size: 15px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.rt {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-3);
}
.rbtn.red {
  color: var(--red-light);
  border-color: var(--red-border);
}
.rbtn.yellow {
  color: var(--yellow-light);
  border-color: var(--yellow-border);
}
.rbtn.green {
  color: var(--green-light);
  border-color: var(--green-border);
}
.rbtn.blue {
  color: var(--blue-light);
  border-color: var(--blue-border);
}
@media (max-width: 600px) {
  .rgrid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .fc {
    padding: 22px;
  }
  .rh {
    padding: 14px 16px;
  }
}
</style>
