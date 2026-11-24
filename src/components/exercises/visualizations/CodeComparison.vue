<script setup lang="ts">
import { t } from '../../../lib/i18n.ts'
import { computed } from 'vue'
import Markdown from '../../Markdown.vue'
import CodeBlock from '../../CodeBlock.vue'
import type { PropType } from 'vue'

const props = defineProps({
  config: { type: Object as PropType<{ variants: { label: string; code: string; outcome: string }[] }>, required: true },
  codeLanguage: { type: String, default: 'javascript' },
  step: { type: Object, default: null },
})
const activeVariant = defineModel({ type: Number, default: 0 })
const variant = computed(() => props.config.variants[activeVariant.value])
</script>

<template>
  <div class="comparison">
    <div class="variants" role="group" :aria-label="t('Compare example variants')">
      <button
        v-for="({ label }, index) in config.variants"
        :key="index"
        type="button"
        class="btn btn-sm"
        :class="index === activeVariant ? 'btn-primary' : 'btn-ghost'"
        :aria-pressed="index === activeVariant"
        @click="activeVariant = index"
      >
        {{ label }}
      </button>
    </div>
    <CodeBlock :code="variant.code" :language="codeLanguage" :file-name="t('example')" :active-line="step?.line" />
    <div class="variant-outcome" aria-live="polite" aria-atomic="true">
      <Markdown :src="step?.say || variant.outcome" />
    </div>
  </div>
</template>

<style scoped>
.comparison {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
}
.variants {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.variant-outcome {
  padding-left: 12px;
  border-left: 3px solid var(--purple);
  color: var(--text-2);
}
</style>
