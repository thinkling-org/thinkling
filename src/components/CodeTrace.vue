<script setup>
import { t } from '../lib/i18n.js'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { highlightLines } from '../lib/markdown.js'
import { play, playStep } from '../lib/sfx.js'
import Markdown from './Markdown.vue'
import Icon from './Icon.vue'

const props = defineProps({
  exercise: { type: Object, required: true },
  trace: { type: Object, required: true }, // { headline, mistake, takeaway, steps[] }
  chosenIndex: { type: Number, default: null },
})
const i = ref(0)
const steps = computed(() => props.trace.steps || [])
const step = computed(() => steps.value[i.value] || {})
const prevStep = computed(() => steps.value[i.value - 1] || { output: [] })
const atEnd = computed(() => i.value >= steps.value.length - 1)
const correct = computed(() => props.chosenIndex === props.exercise.correctIndex)
const lines = computed(() => highlightLines(props.exercise.code, props.exercise.codeLanguage || 'javascript'))
const output = computed(() =>
  (step.value.output || []).map((text, k) => ({ text, fresh: k >= (prevStep.value.output || []).length && i.value > 0 })),
)

const KIND_COLOR = {
  function: '#82AAFF',
  string: '#C3E88D',
  number: '#F78C6C',
  boolean: '#C4A7FF',
  object: '#FFCB6B',
  undefined: '#9AA3AB',
  uninitialized: '#FF9AA8',
  other: '#D5DADE',
}

const leftEl = ref(null)
const lessons = ref(null)
const tutorTop = ref(0)
async function placeTutor() {
  await nextTick()
  const line = leftEl.value?.querySelector('.ln.on')
  if (!line || !leftEl.value) return
  const top = line.getBoundingClientRect().top - leftEl.value.getBoundingClientRect().top
  tutorTop.value = Math.max(0, top - 18)
}

function go(n) {
  i.value = Math.min(Math.max(0, n), steps.value.length - 1)
}
function onKey(e) {
  const t = e.target
  if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')) return
  if (e.key === 'ArrowRight') {
    e.preventDefault()
    go(i.value + 1)
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault()
    go(i.value - 1)
  }
}

watch(i, (n, o) => {
  placeTutor()
  if (n > o) playStep(n)
  else play('pop', 0.75)
  const s = steps.value[n] || {}
  const prevOut = (steps.value[n - 1]?.output || []).length
  if (n > o && (s.output || []).length > prevOut) setTimeout(() => play('blip'), 110)
  if (n > o && (s.memory || []).some((m) => m.changed)) setTimeout(() => play('ding'), 170)
})
watch(atEnd, (v) => {
  if (!v) return
  setTimeout(() => play('sparkle'), 280)
  nextTick(() => lessons.value?.scrollIntoView({ block: 'center', behavior: 'smooth' }))
})
onMounted(() => {
  placeTutor()
  playStep(0)
  window.addEventListener('keydown', onKey)
  window.addEventListener('resize', placeTutor)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('resize', placeTutor)
})
</script>

<template>
  <div class="trace">
    <div class="th">
      <h2>{{ t('Prześledźmy to razem') }}</h2>
      <template v-if="exercise.type !== 'learn'">
        <span v-if="chosenIndex != null && !correct" class="chip-r">{{ t('twoja:') }} {{ exercise.options[chosenIndex] }}</span>
        <span class="chip-g">{{ t('poprawna:') }} {{ exercise.options[exercise.correctIndex] }}</span>
      </template>
    </div>

    <div class="grid">
      <div ref="leftEl" class="left">
        <section class="out" aria-label="Output">
          <div class="out-h"><svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M4 7h16l-8 11z" /></svg>OUTPUT</div>
          <div class="out-b">
            <span v-if="!output.length" class="muted">{{ t('// pusto') }}</span>
            <span v-for="(o, k) in output" :key="`${i}-${k}`" :class="{ fresh: o.fresh }">{{ o.text }}</span>
          </div>
        </section>

        <section class="code" :aria-label="t('Kod')">
          <div class="code-h">
            <span v-if="step.phase" class="phase" :class="{ alt: /2|EXEC|MIKRO|MAKRO/i.test(step.phase) }">{{ step.phase }}</span>
            <span class="fn">{{ exercise.fileName || 'snippet.js' }}</span>
          </div>
          <div class="lines">
            <div
              v-for="(l, n) in lines"
              :key="n"
              class="ln"
              :class="{ on: step.line === n + 1, skipped: step.line === n + 1 && step.skipped }"
            >
              <span class="no">{{ n + 1 }}</span>
              <span class="src" v-html="l || ' '" />
              <span v-if="step.line === n + 1 && step.note" :key="i" class="ghost">// {{ step.note }}</span>
            </div>
          </div>
          <div class="ctrl">
            <button class="cb" :aria-label="t('Od początku')" @click="go(0)"><Icon name="refresh" :size="18" :stroke="2.4" /></button>
            <button class="cb" :aria-label="t('Poprzedni krok')" :disabled="i === 0" @click="go(i - 1)"><Icon name="arrow-left" :size="18" :stroke="2.6" /></button>
            <button class="cb primary" :aria-label="t('Następny krok')" :disabled="atEnd" @click="go(i + 1)"><Icon name="arrow-right" :size="18" :stroke="2.8" /></button>
            <div class="dots">
              <button
                v-for="(s, k) in steps"
                :key="k"
                class="dot"
                :class="{ cur: k === i, past: k < i, gap: k > 0 && s.phase !== steps[k - 1].phase }"
                :aria-label="t('Krok {0}', [k + 1])"
                @click="go(k)"
              />
            </div>
            <span class="cnt">{{ i + 1 }} / {{ steps.length }}</span>
          </div>
        </section>

        <section class="mem" :aria-label="t('Pamięć')">
          <span class="label">{{ t('Pamięć · scope') }}</span>
          <div class="mem-list">
            <span v-if="!step.memory?.length" class="muted">{{ t('pusto — silnik jeszcze nic nie zarejestrował') }}</span>
            <div v-for="m in step.memory || []" :key="m.name" class="mrow" :class="{ changed: m.changed }">
              <span class="mn">{{ m.name }}</span>
              <span class="arrow">→</span>
              <span class="mv" :style="{ color: KIND_COLOR[m.kind] || KIND_COLOR.other }">{{ m.kind === 'uninitialized' ? '‹TDZ›' : m.value }}</span>
              <span v-if="m.changed" class="badge">{{ t('zmiana') }}</span>
            </div>
          </div>
        </section>
      </div>

      <aside class="tutor" aria-live="polite">
        <div class="tutor-in" :style="{ transform: `translateY(${tutorTop}px)` }">
          <svg role="img" aria-label="Tutor Hex" width="60" height="60" viewBox="0 0 64 64" class="hex">
            <polygon points="32,4 56,18 56,46 32,60 8,46 8,18" fill="#7C5CFF" />
            <polygon points="32,4 56,18 32,30 8,18" fill="#A08BFF" />
            <ellipse cx="23" cy="36" rx="6.5" ry="7.5" fill="#fff" />
            <ellipse cx="41" cy="36" rx="6.5" ry="7.5" fill="#fff" />
            <circle cx="21" cy="37" r="3.4" fill="#15181B" />
            <circle cx="39" cy="37" r="3.4" fill="#15181B" />
          </svg>
          <div class="bubble" :key="i">
            <span class="kicker">{{ step.title }}</span>
            <Markdown :src="step.say" class="say" />
          </div>
        </div>
      </aside>
    </div>

    <div v-if="atEnd" ref="lessons" class="lessons">
      <div class="card ls">
        <span class="label" :style="{ color: correct || exercise.type === 'learn' ? 'var(--green-light)' : 'var(--red-light)' }">{{ correct || exercise.type === 'learn' ? t('Co było kluczowe') : t('Gdzie był błąd') }}</span>
        <Markdown :src="trace.mistake" />
      </div>
      <div class="card ls">
        <span class="label" style="color: var(--green-light)">{{ t('Zapamiętaj') }}</span>
        <Markdown :src="trace.takeaway" />
      </div>
    </div>
    <p v-else class="hint muted">{{ t('Klikaj strzałkę (albo ← →), aż Hex dojdzie do końca kodu.') }}</p>
  </div>
</template>

<style scoped>
.trace {
  display: flex;
  flex-direction: column;
  gap: 16px;
  animation: dl-pop 0.25s ease-out;
}
.th {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.th h2 {
  font-size: 26px;
  margin-right: 8px;
}
.chip-r,
.chip-g {
  border-radius: 10px;
  padding: 5px 10px;
  font-family: var(--mono);
  font-size: 13px;
  font-weight: 700;
  border: 2px solid;
}
.chip-r {
  background: #321c22;
  border-color: var(--red-border);
  color: var(--red-light);
}
.chip-g {
  background: var(--green-soft);
  border-color: var(--green-border);
  color: var(--green-light);
}
.grid {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  align-items: flex-start;
}
.left {
  flex: 999 1 520px;
  max-width: 720px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.out {
  background: var(--yellow);
  border-radius: 16px;
  padding: 4px 6px 6px;
  box-shadow: 0 5px 0 var(--yellow-dark);
}
.out-h {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px 8px;
  color: var(--yellow-bg);
  font-weight: 900;
  font-size: 13px;
  letter-spacing: 0.08em;
}
.out-b {
  background: #0b0d0f;
  border-radius: 12px;
  padding: 12px 16px;
  min-height: 56px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-family: var(--mono);
  font-size: 16px;
  color: var(--text-2);
}
.out-b .fresh {
  color: var(--green-light);
  animation: dl-pop 0.35s ease-out;
  transform-origin: left;
}
.code {
  background: var(--bg-deep);
  border: 2px solid var(--border);
  border-radius: 16px;
  overflow: hidden;
}
.code-h {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 2px solid var(--divider);
  min-height: 46px;
}
.phase {
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.08em;
  border-radius: 8px;
  padding: 5px 10px;
  background: var(--purple-soft);
  color: var(--purple-light);
}
.phase.alt {
  background: var(--yellow-bg);
  color: var(--yellow-light);
}
.fn {
  margin-left: auto;
  font-family: var(--mono);
  font-size: 13px;
  color: var(--muted);
}
.lines {
  padding: 10px 0;
  font-family: var(--mono);
  font-size: 16px;
  color: var(--text-2);
  overflow-x: auto;
}
.ln {
  display: flex;
  align-items: center;
  min-height: 40px;
  padding-right: 16px;
  opacity: 0.5;
  transition: background 0.25s, opacity 0.25s;
  white-space: pre;
}
.ln.on {
  opacity: 1;
  background: #1e1a33;
  box-shadow: inset 4px 0 0 var(--purple);
}
.ln.skipped .src {
  text-decoration: line-through;
  text-decoration-color: var(--muted);
  opacity: 0.6;
}
.no {
  width: 48px;
  flex: none;
  text-align: right;
  padding-right: 16px;
  color: var(--faint);
}
.ln.on .no {
  color: var(--purple-light);
  font-weight: 700;
}
.ghost {
  margin-left: 18px;
  font-style: italic;
  font-size: 14px;
  color: #a898ff;
  animation: dl-pop 0.3s ease-out;
  transform-origin: left;
}
.ctrl {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--divider);
}
.cb {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: #2f363b;
  border: none;
  border-bottom: 3px solid #1b1f22;
  display: grid;
  place-items: center;
  cursor: pointer;
  color: var(--text-2);
}
.cb.primary {
  background: var(--purple);
  border-bottom-color: var(--purple-dark);
  color: #fff;
}
.cb:disabled {
  opacity: 0.35;
  cursor: default;
}
.dots {
  flex: 1;
  display: flex;
  gap: 5px;
  align-items: center;
  padding-left: 8px;
  flex-wrap: wrap;
}
.dot {
  height: 8px;
  width: 10px;
  border-radius: 999px;
  border: none;
  padding: 0;
  background: #3a4247;
  cursor: pointer;
  transition: all 0.2s;
}
.dot.gap {
  margin-left: 8px;
}
.dot.past {
  background: var(--purple-dark);
}
.dot.cur {
  width: 24px;
  background: var(--purple);
}
.cnt {
  font-weight: 900;
  font-size: 13px;
  color: var(--text-3);
  letter-spacing: 0.06em;
}
.mem {
  background: var(--surface);
  border: 2px solid var(--border);
  border-radius: 16px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.mem-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.mrow {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 10px;
  background: var(--bg);
  border: 2px solid var(--divider);
  font-family: var(--mono);
  font-size: 14px;
  font-weight: 700;
  transition: background 0.25s, border-color 0.25s;
}
.mrow.changed {
  background: var(--yellow-bg);
  border-color: var(--yellow-border);
}
.arrow {
  color: #6e777e;
}
.badge {
  background: var(--yellow);
  color: var(--yellow-bg);
  border-radius: 6px;
  padding: 1px 6px;
  font-family: var(--font);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.tutor {
  flex: 1 1 280px;
  position: relative;
  min-height: 200px;
}
.tutor-in {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  transition: transform 0.4s cubic-bezier(0.3, 1.4, 0.5, 1);
}
.hex {
  flex: none;
  filter: drop-shadow(0 0 16px rgba(124, 92, 255, 0.7));
  animation: dl-float 2.6s ease-in-out infinite;
}
@keyframes dl-float {
  0%,
  100% {
    transform: translateY(0) rotate(-4deg);
  }
  50% {
    transform: translateY(-4px) rotate(3deg);
  }
}
.bubble {
  position: relative;
  background: var(--text);
  color: var(--bg);
  border-radius: 16px;
  padding: 14px 16px;
  box-shadow: 0 5px 0 var(--text-3);
  max-width: 340px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  animation: dl-pop 0.25s ease-out;
}
.bubble::before {
  content: '';
  position: absolute;
  left: -7px;
  top: 22px;
  width: 14px;
  height: 14px;
  background: var(--text);
  transform: rotate(45deg);
}
.kicker {
  position: relative;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--purple-dark);
}
.say {
  position: relative;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.45;
}
.say :deep(code) {
  background: #e3e0f5;
  color: #4a33b8;
}
.lessons {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  animation: dl-pop 0.3s ease-out;
}
.ls {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 15px;
  color: var(--text-2);
}
.hint {
  margin: 0;
  font-weight: 700;
}
@media (max-width: 900px) {
  .tutor {
    min-height: 0;
    order: -1;
  }
  .tutor-in {
    transform: none !important;
  }
  .lessons {
    grid-template-columns: 1fr;
  }
}
</style>
