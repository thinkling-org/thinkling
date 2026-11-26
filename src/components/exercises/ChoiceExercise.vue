<script setup lang="ts">
import { t } from '../../lib/i18n.ts'
import { computed } from 'vue'
import Markdown from '../Markdown.vue'
import CodeBlock from '../CodeBlock.vue'
import Icon from '../Icon.vue'
import type { PropType } from 'vue'
import type { Exercise, ExerciseResult } from '../../domain.ts'

const props = defineProps({
  exercise: { type: Object as PropType<Exercise>, required: true },
  modelValue: { type: Number, default: null },
  result: { type: Object as PropType<ExerciseResult>, default: null },
})
const emit = defineEmits(['update:modelValue'])

const short = computed(() => props.exercise.options.every((o) => String(o).length <= 28))
const isOutput = computed(() => !!props.exercise.code)
const isPractice = computed(() => props.exercise.stage === 'practice')

function state(i) {
  if (!props.result) return props.modelValue === i ? 'selected' : ''
  if (i === props.exercise.correctIndex) return 'right'
  if (i === props.modelValue) return isPractice.value ? 'selected' : 'wrong'
  return 'dim'
}
</script>

<template>
  <div class="ex">
    <span v-if="exercise.warmup" class="kind label warm">{{ t('Warm-up · take a guess, it doesn\'t count against you') }}</span>
    <span v-else-if="isPractice" class="kind label">{{ t('Ungraded practice') }}</span>
    <span v-else-if="exercise.stage === 'challenge'" class="kind label warm">{{ t('Optional challenge') }}</span>
    <span v-else class="kind label">{{ isOutput ? t('What does this code print?') : 'Quiz' }}</span>
    <Markdown tag="h1" fit-heading class="q" :src="exercise.prompt" />
    <CodeBlock v-if="exercise.code" :code="exercise.code" :language="exercise.codeLanguage" />
    <div role="radiogroup" :aria-label="t('Answers')" class="opts" :class="{ grid: short }">
      <button
        v-for="(o, i) in exercise.options"
        :key="i"
        role="radio"
        :aria-checked="modelValue === i"
        class="opt"
        :class="[state(i), { mono: isOutput && short }]"
        :disabled="!!result"
        @click="emit('update:modelValue', i)"
      >
        <span class="n">{{ i + 1 }}</span>
        <Markdown inline tag="span" class="ot" :src="String(o)" />
        <Icon v-if="state(i) === 'right'" name="check" :size="20" :stroke="3.5" />
        <Icon v-else-if="state(i) === 'wrong'" name="x" :size="20" :stroke="3.5" />
      </button>
    </div>

    <div v-if="result && exercise.warmup" class="card explain warmup">
      <span class="label">{{ result.status === 'correct' ? t('Good intuition!') : t('Good try') }}</span>
      <span>{{ t('The knowledge card will explain why in a moment.') }}</span>
    </div>
    <div v-else-if="result && exercise.explanation" class="card explain" :class="result.status">
      <span class="label">{{ isPractice ? t('How to solve this exercise') : t('Explanation') }}</span>
      <Markdown :src="exercise.explanation" />
    </div>
  </div>
</template>

<style scoped>
.ex {
  display: flex;
  flex-direction: column;
  gap: 22px;
}
.kind {
  color: var(--purple-link);
}
.kind.warm {
  color: var(--yellow);
}
.hint {
  padding: 10px 16px;
  color: var(--text-2);
}
.hint summary {
  cursor: pointer;
  font-weight: 800;
}
.hint[open] summary {
  margin-bottom: 8px;
}
.q {
  font-size: clamp(24px, 3.2vw, 32px);
  line-height: 1.25;
  font-weight: 900;
}
.opts {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.opts.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.opt {
  display: flex;
  align-items: center;
  gap: 14px;
  background: var(--surface);
  color: var(--text);
  border: 2px solid var(--border);
  border-bottom-width: 5px;
  border-radius: 16px;
  padding: 16px 18px;
  font-weight: 700;
  font-size: 17px;
  text-align: left;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s, transform 0.06s;
}
.opt:hover:not(:disabled) {
  background: #22272b;
}
.opt:active:not(:disabled) {
  transform: translateY(2px);
}
.opt:disabled {
  cursor: default;
}
.opt.mono .ot {
  font-family: var(--mono);
  letter-spacing: 0.08em;
  /* Expected program output may span multiple lines. */
  white-space: pre-line;
}
.opts.grid .opt.mono {
  justify-content: center;
  font-size: 20px;
}
.ot {
  flex: 1;
  overflow-wrap: anywhere;
}
.opts.grid .opt.mono .ot {
  flex: 0 1 auto;
  min-width: 0;
  overflow-wrap: break-word;
}
.n {
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 2px solid var(--border);
  display: grid;
  place-items: center;
  font-size: 13px;
  font-weight: 900;
  color: var(--muted);
  font-family: var(--font);
  letter-spacing: 0;
}
.opt.selected {
  background: var(--purple-soft);
  border-color: var(--purple);
  color: var(--purple-light);
}
.opt.selected .n {
  border-color: var(--purple);
  color: var(--purple-light);
}
.opt.right {
  background: var(--green-soft);
  border-color: var(--green);
  color: var(--green-light);
}
.opt.wrong {
  background: #321c22;
  border-color: var(--red);
  color: var(--red-light);
}
.opt.dim {
  opacity: 0.5;
}
.explain {
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 16px;
  color: var(--text-2);
  animation: dl-pop 0.25s ease-out;
}
.explain.correct {
  border-color: var(--green-border);
}
.explain.correct .label {
  color: var(--green-light);
}
.explain.wrong {
  border-color: var(--red-border);
}
.explain.wrong .label {
  color: var(--red-light);
}
.explain.warmup {
  border-color: var(--yellow-border);
  font-weight: 700;
}
.explain.warmup .label {
  color: var(--yellow-light);
}
@media (max-width: 600px) {
  .opts.grid {
    grid-template-columns: 1fr;
  }
}
</style>
