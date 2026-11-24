<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useApp } from '../stores/app.js'
import AppShell from '../components/AppShell.vue'
import Gem from '../components/Gem.vue'
import Icon from '../components/Icon.vue'
import ScoreGauge from '../components/ScoreGauge.vue'
import { play } from '../lib/sfx.js'

const app = useApp()
const router = useRouter()

const KIND_ICON = { theory: 'question', output: 'terminal', code: 'code', mixed: 'mixed', design: 'design', test: 'trophy' }
const KIND_LABEL = { theory: 'Pytania otwarte', output: 'Co wypisze kod?', code: 'Zadania w edytorze', mixed: 'Mieszanka', design: 'Decyzje projektowe', test: 'Sprawdzian modułu' }

const current = computed(() => app.currentLesson)
const currentModuleIndex = computed(() => current.value?.moduleIndex ?? app.plan.modules.length - 1)
const offset = (i) => Math.round(Math.sin(i * 0.95) * 92)

const openId = ref(null)
function toggle(id) {
  openId.value = openId.value === id ? null : id
  if (openId.value) play('pop')
}
function start(l) {
  router.push(`/lesson/${l.id}`)
}

function moduleState(mi) {
  const m = app.plan.modules[mi]
  if (m.lessons.every((l) => l.status === 'done')) return 'done'
  if (mi === currentModuleIndex.value) return 'current'
  return 'locked'
}

const dailyGoal = computed(() => app.profile?.minutesPerDay || 30)
const dailyPct = computed(() => Math.min(100, Math.round((app.todayMinutes / dailyGoal.value) * 100)))
const allDone = computed(() => !current.value)

onMounted(async () => {
  app.prefetchNext()
  await nextTick()
  document.querySelector('.node.current')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
})
</script>

<template>
  <AppShell>
    <div class="content">
      <section class="path" @click.self="openId = null">
        <div v-for="(m, mi) in app.plan.modules" :key="m.id" class="module">
          <div class="banner" :class="moduleState(mi)">
            <div class="b-t">
              <span class="b-l">
                Moduł {{ mi + 1 }} · {{ moduleState(mi) === 'done' ? 'ukończony' : `lekcja ${Math.min(m.lessons.filter((l) => l.status === 'done').length + 1, m.lessons.length)} z ${m.lessons.length}` }}
              </span>
              <span class="b-title">{{ m.title }}</span>
            </div>
            <RouterLink to="/plan" class="b-btn"><Icon name="list" :size="18" :stroke="2.4" />Plan</RouterLink>
          </div>

          <div class="nodes">
            <div
              v-for="(l, li) in m.lessons"
              :key="l.id"
              class="node-wrap"
              :class="{ open: openId === l.id }"
              :style="{ transform: `translateX(${offset(li + mi * 3)}px)` }"
            >
              <span v-if="l.status === 'current'" class="bubble">{{ !app.lessonReady(l.id) && app.lessonGen[l.id] ? 'PRZYGOTOWUJĘ…' : 'START' }}</span>
              <button
                class="node"
                :class="[l.status, l.kind === 'test' ? 'test' : '']"
                :aria-label="`Lekcja ${li + 1}: ${l.title}, ${l.status === 'done' ? 'ukończona' : l.status === 'current' ? 'aktualna' : 'zablokowana'}`"
                :aria-expanded="openId === l.id"
                @click="toggle(l.id)"
              >
                <Icon :name="l.status === 'done' && l.kind !== 'test' ? 'check' : KIND_ICON[l.kind] || 'mixed'" :size="l.status === 'current' ? 40 : 32" :stroke="l.status === 'done' ? 3.2 : 2.8" />
              </button>
              <div v-if="openId === l.id" class="pop" :class="l.status" role="dialog" :aria-label="l.title">
                <span class="pop-k">{{ KIND_LABEL[l.kind] || 'Lekcja' }}</span>
                <strong>{{ l.title }}</strong>
                <span class="pop-f">{{ l.focus }}</span>
                <button v-if="l.status === 'current'" class="btn btn-block" style="color: var(--purple)" @click="start(l)">Zacznij +20 XP</button>
                <button v-else-if="l.status === 'done'" class="btn btn-block" @click="start(l)">Powtórz +5 XP</button>
                <span v-else class="pop-lock"><Icon name="lock" :size="16" />Ukończ poprzednie lekcje</span>
              </div>
            </div>
          </div>
        </div>

        <div v-if="allDone" class="card finished">
          <Gem :index="2" :size="64" glow />
          <h2>Plan ukończony!</h2>
          <p>Możesz poprosić o rozszerzenie planu albo ułożyć nowy.</p>
          <div class="row">
            <RouterLink to="/plan" class="btn">Rozszerz plan</RouterLink>
            <RouterLink to="/start" class="btn btn-primary">Nowy plan</RouterLink>
          </div>
        </div>
      </section>

      <aside class="aside">
        <div class="card score">
          <span class="h">Twój wynik</span>
          <ScoreGauge :score="app.score" :delta="app.scoreDelta" />
        </div>
        <div class="tiles">
          <div class="card tile">
            <Icon name="flame" :size="24" style="color: var(--flame)" />
            <span class="tv">{{ app.streakAlive ? app.stats.streak : 0 }} dni</span>
            <span class="tl">seria</span>
          </div>
          <div class="card tile">
            <Gem :index="currentModuleIndex" :size="24" />
            <span class="tv">Moduł {{ currentModuleIndex + 1 }}</span>
            <span class="tl">z {{ app.plan.modules.length }} w planie</span>
          </div>
          <div class="card tile">
            <Icon name="check" :size="24" :stroke="3" style="color: var(--green)" />
            <span class="tv">{{ app.doneCount }} / {{ app.allLessons.length }}</span>
            <span class="tl">lekcji</span>
          </div>
          <div class="card tile">
            <Icon name="cards" :size="24" style="color: var(--blue)" />
            <span class="tv">{{ app.flashcards.length }}</span>
            <span class="tl">fiszek w talii</span>
          </div>
        </div>
        <div class="card goal">
          <div class="goal-h"><span>Cel dzienny</span><span style="color: var(--yellow)">{{ app.todayMinutes }} / {{ dailyGoal }} min</span></div>
          <div class="bar" style="height: 14px"><div :style="{ width: `${dailyPct}%` }" /></div>
        </div>
        <div class="card weak">
          <span class="h2">Słabe punkty wg {{ app.settings.provider === 'codex' ? 'Codex' : 'Claude' }}</span>
          <div class="tags">
            <span v-for="(w, i) in app.weakSpots" :key="w" class="tag" :class="i < 3 ? 'tag-red' : 'tag-yellow'">
              {{ w }}
              <button class="x" :aria-label="`Usuń ${w}`" @click="app.removeWeakSpot(w)"><Icon name="x" :size="12" :stroke="3" /></button>
            </span>
            <span v-if="!app.weakSpots.length" class="muted">Na razie brak.</span>
          </div>
        </div>
        <RouterLink to="/review" class="btn btn-block" :class="{ 'btn-primary': app.dueCards.length }">
          {{ app.dueCards.length ? `Powtórz ${app.dueCards.length} fiszek` : 'Brak fiszek do powtórki' }}
        </RouterLink>
      </aside>
    </div>
  </AppShell>
</template>

<style scoped>
.content {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 32px;
  padding: 28px 32px 60px;
}
.path {
  flex: 999 1 420px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
}
.module {
  width: 100%;
  max-width: 560px;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.banner {
  width: 100%;
  background: var(--border);
  border-bottom: 5px solid #20252a;
  border-radius: 20px;
  padding: 18px 22px;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}
.banner.current {
  background: var(--purple);
  border-bottom-color: var(--purple-dark);
}
.banner.done {
  background: var(--green-dark);
  border-bottom-color: #1a7a46;
}
.b-t {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.b-l {
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.82);
}
.b-title {
  font-size: 22px;
  font-weight: 900;
  color: #fff;
}
.banner.locked .b-l,
.banner.locked .b-title {
  color: var(--text-3);
}
.b-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #fff;
  border: 2px solid rgba(255, 255, 255, 0.45);
  border-bottom-width: 4px;
  border-radius: 14px;
  padding: 10px 16px;
  font-weight: 900;
  font-size: 14px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  text-decoration: none;
}
.b-btn:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.08);
}
.banner.locked .b-btn {
  color: var(--text-3);
  border-color: #3a4147;
}
.nodes {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 26px;
  padding: 36px 0 20px;
  width: 100%;
}
.node-wrap {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.node-wrap.open {
  z-index: 30;
}
.bubble {
  background: var(--text);
  color: var(--bg);
  font-weight: 900;
  font-size: 14px;
  letter-spacing: 0.08em;
  border-radius: 12px;
  padding: 8px 14px;
  border-bottom: 4px solid var(--text-3);
  animation: dl-bob 1.8s ease-in-out infinite;
}
.node {
  width: 76px;
  height: 70px;
  border-radius: 50%;
  border: none;
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: transform 0.08s;
}
.node:active {
  transform: translateY(4px);
}
.node.done {
  background: var(--green);
  box-shadow: 0 7px 0 var(--green-dark);
  color: var(--green-ink);
}
.node.current {
  width: 92px;
  height: 86px;
  background: var(--purple);
  box-shadow: 0 8px 0 var(--purple-dark), 0 0 0 10px var(--purple-ring);
  color: #fff;
}
.node.locked {
  background: var(--border);
  box-shadow: 0 7px 0 #20252a;
  color: #6e777e;
}
.node.test {
  border-radius: 24px;
  width: 84px;
  height: 78px;
}
.node.test.done {
  background: var(--yellow);
  box-shadow: 0 7px 0 var(--yellow-dark);
  color: var(--yellow-bg);
}
.pop {
  position: absolute;
  top: calc(100% + 14px);
  z-index: 10;
  width: 300px;
  background: var(--purple);
  color: #fff;
  border-radius: 18px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.4);
  animation: dl-pop 0.18s ease-out;
}
.pop::before {
  content: '';
  position: absolute;
  top: -8px;
  left: 50%;
  margin-left: -9px;
  border: 9px solid transparent;
  border-top: 0;
  border-bottom-color: inherit;
  border-bottom-color: var(--purple);
}
.pop.done {
  background: var(--green-dark);
}
.pop.done::before {
  border-bottom-color: var(--green-dark);
}
.pop.locked {
  background: var(--surface);
  border: 2px solid var(--border);
  color: var(--text);
}
.pop.locked::before {
  border-bottom-color: var(--border);
}
.pop strong {
  font-size: 18px;
  font-weight: 900;
}
.pop-k {
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.85;
}
.pop-f {
  font-size: 14px;
  font-weight: 600;
  opacity: 0.9;
  line-height: 1.45;
  margin-bottom: 8px;
}
.pop .btn {
  background: #fff;
  border-color: #fff;
  border-bottom-color: #d6d6e6;
}
.pop.done .btn {
  color: var(--green-dark);
}
.pop-lock {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-weight: 700;
}
.finished {
  max-width: 560px;
  width: 100%;
  padding: 28px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
}
.finished p {
  margin: 0;
  color: var(--text-3);
}
.row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: center;
}
.aside {
  flex: 1 1 320px;
  max-width: 380px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  position: sticky;
  top: 20px;
  align-self: flex-start;
}
.score {
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.h {
  align-self: flex-start;
  font-size: 18px;
  font-weight: 900;
}
.tiles {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.tile {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  border-radius: 16px;
}
.tv {
  font-size: 20px;
  font-weight: 900;
}
.tl {
  font-size: 13px;
  color: var(--muted);
  font-weight: 700;
}
.goal,
.weak {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-radius: 16px;
}
.goal-h {
  display: flex;
  justify-content: space-between;
  font-weight: 800;
}
.h2 {
  font-weight: 800;
}
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.x {
  background: none;
  border: none;
  padding: 0;
  color: inherit;
  opacity: 0.6;
  cursor: pointer;
  display: grid;
}
.x:hover {
  opacity: 1;
}
@media (max-width: 860px) {
  .content {
    padding: 20px 16px 40px;
  }
  .aside {
    position: static;
    max-width: none;
  }
}
</style>
