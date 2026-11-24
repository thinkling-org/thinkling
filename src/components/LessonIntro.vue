<script setup>
import { t } from '../lib/i18n.js'
import { computed } from 'vue'
import Markdown from './Markdown.vue'
import Icon from './Icon.vue'

const props = defineProps({
  meta: { type: Object, required: true },
  intro: { type: Object, default: null },
  levels: { type: Array, default: () => [] },
})
const level = defineModel('level', { type: Number, default: 0 })

const isTest = computed(() => props.meta.kind === 'test')
const lessonNo = computed(() => t('Lesson {0} of {1}', [props.meta.lessonIndex + 1, props.meta.module?.lessons?.length || 1]))
const summary = computed(() => props.intro?.summary || (props.intro?.outcome ? '' : props.meta.focus) || '')
// Older lessons provide a single outcome instead of a list of skills.
const outcomes = computed(() => {
  const list = (props.intro?.outcomes || []).filter((item) => item?.trim())
  if (list.length) return list.slice(0, 3)
  return [props.intro?.outcome || props.meta.focus].filter(Boolean)
})
const hero = computed(() => {
  const items = (props.intro?.hero || []).filter((item) => item?.text?.trim())
  return items.length >= 2 ? items.slice(0, 6) : []
})
const current = computed(() => props.levels[level.value] || props.levels[0])
</script>

<template>
  <div class="intro">
    <div v-if="hero.length" class="hero" aria-hidden="true">
      <template v-for="(item, k) in hero" :key="k">
        <span v-if="k && item.kind !== 'symbol' && hero[k - 1].kind !== 'symbol'" class="flow" />
        <span v-if="item.kind === 'symbol'" class="symbol">{{ item.text }}</span>
        <span v-else class="node" :class="`kind-${item.kind}`">
          <span class="chip">{{ item.text }}</span>
          <span v-if="item.label" class="chip-label">{{ item.label }}</span>
        </span>
      </template>
    </div>

    <div class="head">
      <span class="label kicker">{{ isTest ? t('Module assessment') : lessonNo }}</span>
      <Markdown tag="h1" fit-heading inline class="title" :src="meta.title" />
      <Markdown v-if="summary" class="summary" glossary :src="summary" />
    </div>

    <div v-if="outcomes.length" class="outcomes" :class="`n${outcomes.length}`">
      <h2 class="sr-only">{{ isTest ? t('What you\'ll practice') : t('What you\'ll learn') }}</h2>
      <div v-for="(item, k) in outcomes" :key="k" class="outcome">
        <Icon name="check" :size="26" :stroke="2.8" class="tick" />
        <Markdown tag="span" inline glossary :src="item" />
      </div>
    </div>

    <div v-if="intro?.relevance" class="banner goal">
      <Icon name="target" :size="26" :stroke="2.4" />
      <p><strong>{{ t('A step toward your goal:') }}</strong> <Markdown tag="span" inline glossary :src="intro.relevance" /></p>
    </div>
    <div v-if="intro?.focus" class="banner focus">
      <Icon name="bulb" :size="24" :stroke="2.4" />
      <p><strong>{{ t('What to watch:') }}</strong> <Markdown tag="span" inline glossary :src="intro.focus" /></p>
    </div>

    <div v-if="levels.length > 1" class="levels">
      <span id="level-question" class="question">{{ t('How familiar are you with this?') }}</span>
      <div class="options" role="radiogroup" aria-labelledby="level-question">
        <button
          v-for="(item, k) in levels"
          :key="item.label"
          type="button"
          role="radio"
          class="option"
          :class="{ on: k === level }"
          :aria-checked="k === level"
          @click="level = k"
        >{{ t(item.label) }}</button>
      </div>
      <div :key="level" class="plan" aria-live="polite">
        <svg class="mascot" aria-hidden="true" width="36" height="36" viewBox="0 0 64 64"><polygon points="32,4 56,18 56,46 32,60 8,46 8,18" fill="#7C5CFF" /><polygon points="32,4 56,18 32,30 8,18" fill="#A08BFF" /><ellipse cx="23" cy="36" rx="6.5" ry="7.5" fill="#fff" /><ellipse cx="41" cy="36" rx="6.5" ry="7.5" fill="#fff" /><circle cx="21" cy="37" r="3.4" fill="#15181B" /><circle cx="39" cy="37" r="3.4" fill="#15181B" /></svg>
        <span class="bubble">{{ t(current.plan) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.intro {
  width: 100%;
  max-width: 760px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 26px;
  text-align: center;
  animation: dl-pop 0.25s ease-out;
}
.hero {
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 14px 0;
  padding: 20px 0 4px;
}
.node {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.chip {
  padding: 14px 18px;
  border-radius: 14px;
  font-family: var(--mono);
  font-size: clamp(17px, 2.4vw, 22px);
  font-weight: 700;
  white-space: nowrap;
}
.chip-label {
  font-size: 13px;
  font-weight: 800;
}
.kind-input .chip {
  position: relative;
  padding-left: 30px;
  background: #f3e3b5;
  color: #3a2e10;
  box-shadow: 0 5px 0 #c9b57e;
  transform-origin: 8px 50%;
  animation: sway 3s ease-in-out infinite;
}
.kind-input .chip::before {
  content: '';
  position: absolute;
  left: 10px;
  top: 50%;
  width: 10px;
  height: 10px;
  margin-top: -5px;
  border-radius: 50%;
  background: var(--bg);
}
.kind-input .chip-label {
  color: #d9b86a;
}
.kind-operation .chip {
  min-width: 64px;
  padding: 24px 22px;
  border-radius: 22px;
  background: var(--purple);
  color: #fff;
  animation: glow 2.4s ease-in-out infinite;
}
.kind-operation .chip-label {
  color: var(--purple-link);
}
.kind-value .chip {
  background: #3b82f6;
  color: #fff;
  box-shadow: 0 6px 0 #2557b8;
}
.kind-value .chip-label {
  color: var(--blue-light);
}
.kind-result .chip {
  background: var(--green);
  color: var(--green-ink);
  box-shadow: 0 6px 0 var(--green-dark);
}
.kind-result .chip-label {
  color: var(--green-light);
}
.flow {
  width: clamp(28px, 6vw, 60px);
  height: 6px;
  margin: 0 6px 26px;
  border-radius: 999px;
  background: repeating-linear-gradient(90deg, var(--purple) 0 12px, transparent 12px 24px);
  animation: flow 0.8s linear infinite;
}
.symbol {
  margin: 0 12px 26px;
  color: var(--muted);
  font-family: var(--mono);
  font-size: clamp(17px, 2.4vw, 22px);
  font-weight: 700;
  white-space: nowrap;
}
.head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.kicker {
  color: var(--purple-link);
}
.title {
  margin: 0;
  font-size: clamp(32px, 5vw, 48px);
  line-height: 1.08;
  letter-spacing: -0.02em;
}
.summary {
  max-width: 580px;
  color: var(--text-3);
  font-size: 19px;
  line-height: 1.5;
}
.summary :deep(p) {
  margin: 0;
}
.outcomes {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  text-align: left;
}
.outcomes.n1 {
  grid-template-columns: minmax(0, 1fr);
}
.outcomes.n2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.outcome {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  border: 2px solid var(--border);
  border-bottom-width: 5px;
  border-radius: 16px;
  background: var(--surface);
  font-size: 16px;
  font-weight: 800;
  line-height: 1.35;
}
.tick {
  color: var(--green);
}
.banner {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
  border-radius: 16px;
  text-align: left;
}
.banner p {
  flex: 1;
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.45;
  color: var(--text-2);
}
.banner > svg {
  flex: none;
}
.goal {
  border: 2px solid #3a3260;
  background: #1e1a33;
}
.goal > svg {
  color: var(--purple-link);
}
.focus {
  margin-top: -14px;
  border: 2px solid var(--border);
  background: var(--surface-2);
}
.focus > svg {
  color: var(--yellow);
}
.levels {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.question {
  font-size: 16px;
  font-weight: 800;
}
.options {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
}
.option {
  min-height: 44px;
  padding: 10px 16px;
  border: 2px solid var(--border);
  border-bottom-width: 4px;
  border-radius: 14px;
  background: var(--surface);
  color: var(--text-3);
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
}
.option.on {
  border-color: var(--purple);
  background: var(--purple-soft);
  color: var(--purple-light);
}
.plan {
  display: flex;
  align-items: center;
  gap: 10px;
  animation: dl-pop 0.25s ease-out;
}
.mascot {
  flex: none;
  filter: drop-shadow(0 0 10px color-mix(in srgb, var(--purple) 60%, transparent));
  animation: float 2.6s ease-in-out infinite;
}
.bubble {
  padding: 8px 14px;
  border-radius: 14px;
  background: var(--text);
  color: var(--bg);
  font-size: 15px;
  font-weight: 700;
  text-align: left;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
@keyframes sway {
  0%, 100% { transform: rotate(-6deg); }
  50% { transform: rotate(-2deg); }
}
@keyframes flow {
  to { background-position: 24px 0; }
}
@keyframes glow {
  0%, 100% { box-shadow: 0 0 0 transparent, 0 6px 0 var(--purple-dark); }
  50% { box-shadow: 0 0 28px color-mix(in srgb, var(--purple) 65%, transparent), 0 6px 0 var(--purple-dark); }
}
@keyframes float {
  0%, 100% { transform: translateY(0) rotate(-4deg); }
  50% { transform: translateY(-4px) rotate(3deg); }
}
@media (prefers-reduced-motion: reduce) {
  .input .chip,
  .kind-operation .chip,
  .flow,
  .mascot,
  .plan {
    animation: none;
  }
}
@media (max-width: 640px) {
  .outcomes,
  .outcomes.n2 {
    grid-template-columns: minmax(0, 1fr);
  }
  .summary {
    font-size: 17px;
  }
  .flow {
    width: 18px;
    margin: 0 4px 26px;
  }
}
</style>
