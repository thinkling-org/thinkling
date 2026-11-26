<script setup lang="ts">
import { t } from '../../lib/i18n.ts'
import { computed, ref } from 'vue'
import Markdown from '../Markdown.vue'
import CodeBlock from '../CodeBlock.vue'
import Icon from '../Icon.vue'
import BlockHost from '../../blocks/BlockHost.vue'
import { blockDefinition, readLessonVisualization } from '../../blocks/registry.ts'
import { pluginState } from '../../blocks/installed.ts'
import MissingExtension from './MissingExtension.vue'
import type { BlockProps } from '../../blocks/types.ts'

const props = defineProps({
  exercise: { type: Object, required: true },
  comparisonStep: { type: Object, default: null },
})
const activeVariant = defineModel('activeVariant', { type: Number, default: 0 })
const emit = defineEmits(['trace', 'review-concept'])
const savedTerms = ref(new Set())
const visualization = computed(() => readLessonVisualization(props.exercise))
const block = computed(() => visualization.value && blockDefinition(visualization.value.type))
// The comparison shares its active variant and step with lesson navigation.
const isComparison = computed(() => visualization.value?.type === 'code-comparison')
const blockProps = computed<BlockProps>(() => ({
  data: visualization.value,
  codeLanguage: language.value,
  ...(isComparison.value && { modelValue: activeVariant.value, step: props.comparisonStep }),
}))

function onBlockEvent(name: string, payload: unknown) {
  if (isComparison.value && name === 'update:modelValue') activeVariant.value = payload as number
}
const language = computed(() => props.exercise.codeLanguage || 'javascript')
// Use the lesson’s worked example in place of a separate code listing.
const ownsCode = computed(() => !!block.value?.ownsCode?.(visualization.value))
// A card made with an extension that is now missing or turned off explains why instead of showing nothing.
const missingExtension = computed(() => {
  const type = props.exercise.visualization?.type
  return typeof type === 'string' && pluginState.ready && !blockDefinition(type) ? type : null
})

function saveConcept(concept) {
  emit('review-concept', concept)
  savedTerms.value.add(concept.term)
}

</script>

<template>
  <div class="learn">
    <span class="kind label"><Icon name="bulb" :size="16" :stroke="2.6" />{{ t('Knowledge card') }}</span>
    <Markdown tag="h1" fit-heading class="title" :src="exercise.title || t('New concept')" inline />
    <Markdown class="body" :src="exercise.prompt" />
    <BlockHost v-if="block" :block="block" :block-props="blockProps" @event="onBlockEvent" />
    <MissingExtension v-else-if="missingExtension" :block-type="missingExtension" />
    <div v-if="!ownsCode && exercise.code?.trim()" class="example">
      <button type="button" class="btn btn-ghost btn-sm" @click="$emit('trace')" @keydown.enter.stop>
        <Icon name="play" :size="16" />{{ t('Trace the example') }}
      </button>
      <CodeBlock :code="exercise.code" :language="exercise.codeLanguage || 'javascript'" :file-name="t('example')" />
    </div>
    <component
      v-if="exercise.prerequisites?.length || exercise.explanation || exercise.keyPoints?.length"
      :is="isComparison ? 'details' : 'div'"
      class="support"
    >
      <summary v-if="isComparison">{{ t('Help with the example') }}</summary>
      <div v-if="exercise.prerequisites?.length" class="prerequisites">
        <details v-for="concept in exercise.prerequisites" :key="concept.term" class="card prerequisite">
          <summary>{{ t('Show a simpler example ·') }} <Markdown :src="concept.term" inline tag="span" /></summary>
          <Markdown :src="concept.explanation" />
          <button type="button" class="btn btn-ghost btn-sm" :disabled="savedTerms.has(concept.term)" @click="saveConcept(concept)">
            {{ savedTerms.has(concept.term) ? t('Saved for review') : t('Save for review') }}
          </button>
        </details>
      </div>
      <div v-if="exercise.explanation || exercise.keyPoints?.length" class="cards">
        <div v-if="exercise.explanation" class="card trap">
          <h2 class="label">{{ exercise.stage === 'learn' ? t('Why it works') : t('Pitfall') }}</h2>
          <Markdown :src="exercise.explanation" />
        </div>
        <div v-if="exercise.keyPoints?.length" class="card keep">
          <h2 class="label">{{ t('Remember') }}</h2>
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
  max-width: 760px;
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
