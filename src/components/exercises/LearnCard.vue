<script setup>
import { computed, ref } from 'vue'
import Markdown from '../Markdown.vue'
import CodeBlock from '../CodeBlock.vue'
import Icon from '../Icon.vue'
import CodeComparison from './visualizations/CodeComparison.vue'
import LinearRegression from './visualizations/LinearRegression.vue'
import CodeDefinitions from './visualizations/CodeDefinitions.vue'
import StepTrace from './visualizations/StepTrace.vue'
import StateInspector from './visualizations/StateInspector.vue'
import ValueChart from './visualizations/ValueChart.vue'
import LogicCircuit from './visualizations/LogicCircuit.vue'
import StepOrdering from './visualizations/StepOrdering.vue'
import Diagnosis from './visualizations/Diagnosis.vue'
import SystemSim from './visualizations/SystemSim.vue'
import { readLessonVisualization } from '../../lib/lesson-visualizations.js'

const props = defineProps({
  exercise: { type: Object, required: true },
  comparisonStep: { type: Object, default: null },
})
const activeVariant = defineModel('activeVariant', { type: Number, default: 0 })
const emit = defineEmits(['trace', 'review-concept'])
const savedTerms = ref(new Set())
const visualizations = {
  'code-comparison': CodeComparison,
  'linear-regression': LinearRegression,
  'code-definitions': CodeDefinitions,
  'step-trace': StepTrace,
  'state-inspector': StateInspector,
  'value-chart': ValueChart,
  'logic-circuit': LogicCircuit,
  'step-ordering': StepOrdering,
  diagnosis: Diagnosis,
  'system-sim': SystemSim,
}
const WITH_CODE = ['code-comparison', 'code-definitions', 'step-trace', 'state-inspector']
const visualization = computed(() => readLessonVisualization(props.exercise))
const isComparison = computed(() => visualization.value?.type === 'code-comparison')
const visualizationProps = computed(() => {
  const type = visualization.value?.type
  if (isComparison.value) return { codeLanguage: language.value, modelValue: activeVariant.value, step: props.comparisonStep }
  return WITH_CODE.includes(type) ? { codeLanguage: language.value } : {}
})
const language = computed(() => props.exercise.codeLanguage || 'javascript')
// Pomoc z własnym kodem zastępuje osobny przykład, żeby uczeń nie czytał dwóch listingów.
const ownsCode = computed(() => visualization.value?.type === 'state-inspector'
  ? !!visualization.value.code
  : WITH_CODE.includes(visualization.value?.type))

function saveConcept(concept) {
  emit('review-concept', concept)
  savedTerms.value.add(concept.term)
}

</script>

<template>
  <div class="learn">
    <span class="kind label"><Icon name="bulb" :size="16" :stroke="2.6" />Karta wiedzy</span>
    <Markdown tag="h1" fit-heading class="title" :src="exercise.title || 'Nowe pojęcie'" inline />
    <Markdown class="body" :src="exercise.prompt" />
    <component
      v-if="visualization"
      :is="visualizations[visualization.type]"
      :config="visualization"
      v-bind="visualizationProps"
      @update:model-value="activeVariant = $event"
    />
    <div v-if="!ownsCode && exercise.code?.trim()" class="example">
      <button type="button" class="btn btn-ghost btn-sm" @click="$emit('trace')" @keydown.enter.stop>
        <Icon name="play" :size="16" />Prześledź przykład
      </button>
      <CodeBlock :code="exercise.code" :language="exercise.codeLanguage || 'javascript'" file-name="przykład" />
    </div>
    <component
      v-if="exercise.prerequisites?.length || exercise.explanation || exercise.keyPoints?.length"
      :is="isComparison ? 'details' : 'div'"
      class="support"
    >
      <summary v-if="isComparison">Pomoc do przykładu</summary>
      <div v-if="exercise.prerequisites?.length" class="prerequisites">
        <details v-for="concept in exercise.prerequisites" :key="concept.term" class="card prerequisite">
          <summary>Pokaż prostszy przykład · <Markdown :src="concept.term" inline tag="span" /></summary>
          <Markdown :src="concept.explanation" />
          <button type="button" class="btn btn-ghost btn-sm" :disabled="savedTerms.has(concept.term)" @click="saveConcept(concept)">
            {{ savedTerms.has(concept.term) ? 'Zapisano do powtórki' : 'Zapisz do powtórki' }}
          </button>
        </details>
      </div>
      <div v-if="exercise.explanation || exercise.keyPoints?.length" class="cards">
        <div v-if="exercise.explanation" class="card trap">
          <h2 class="label">{{ exercise.stage === 'learn' ? 'Dlaczego to działa' : 'Pułapka' }}</h2>
          <Markdown :src="exercise.explanation.replace(/^\s*\**pułapka\**\s*:\s*/i, '')" />
        </div>
        <div v-if="exercise.keyPoints?.length" class="card keep">
          <h2 class="label">Zapamiętaj</h2>
          <ul>
            <li v-for="(k, i) in exercise.keyPoints" :key="i"><Markdown inline glossary tag="span" :src="k" /></li>
          </ul>
        </div>
      </div>
    </component>
  </div>
</template>

<style scoped>
.learn {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.kind {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--yellow);
}
.title {
  font-size: clamp(26px, 3.4vw, 34px);
  line-height: 1.2;
  font-weight: 900;
}
.body {
  font-size: 18px;
  line-height: 1.65;
  color: var(--text-2);
}
.example {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
}
.example .btn {
  justify-self: end;
}
.support > summary {
  color: var(--muted);
  font-weight: 700;
  cursor: pointer;
}
.support > summary + div,
.support .prerequisites + .cards {
  margin-top: 12px;
}
.prerequisites {
  display: grid;
  gap: 8px;
}
.prerequisite {
  padding: 10px 14px;
  color: var(--text-2);
}
.prerequisite summary {
  cursor: pointer;
  font-weight: 800;
}
.prerequisite > :deep(.md),
.prerequisite > button {
  margin-top: 8px;
}
.cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.cards > :only-child {
  grid-column: 1 / -1;
}
.trap,
.keep {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 15px;
  color: var(--text-2);
}
.trap {
  border-color: var(--yellow-border);
}
.trap .label {
  color: var(--yellow-light);
}
.keep {
  border-color: var(--green-border);
}
.keep .label {
  color: var(--green-light);
}
.keep ul {
  margin: 0;
  padding-left: 1.1em;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-weight: 700;
}
@media (max-width: 640px) {
  .cards {
    grid-template-columns: 1fr;
  }
}
</style>
