<script setup lang="ts">
import { t } from './messages.ts'
import { computed, onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from 'vue'
import CodeBlock from '../../components/CodeBlock.vue'
import CodeTutor from '../../components/CodeTutor.vue'
import { UiButton } from '../../components/ui/index.ts'
import type { PropType } from 'vue'

const props = defineProps({
  config: { type: Object as PropType<{ variants: { label: string; code: string; outcome: string }[] }>, required: true },
  codeLanguage: { type: String, default: 'javascript' },
  step: { type: Object, default: null },
})
const activeVariant = defineModel({ type: Number, default: 0 })
const variant = computed(() => props.config.variants[activeVariant.value])
const code = useTemplateRef('code')
const tutorTop = shallowRef(0)
let observer: ResizeObserver | undefined

function placeTutor() {
  const line = code.value?.querySelector('.ln.active')
  tutorTop.value = line ? Math.max(0, line.getBoundingClientRect().top - code.value.getBoundingClientRect().top - 18) : 0
}

watch([() => props.step?.line, () => variant.value.code], placeTutor, { flush: 'post' })
onMounted(() => {
  placeTutor()
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(placeTutor)
    observer.observe(code.value)
  }
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <div class="comparison">
    <div class="variants" role="group" :aria-label="t('Compare example variants')">
      <UiButton
        v-for="({ label }, index) in config.variants"
        :key="index"
        :variant="index === activeVariant ? 'primary' : 'ghost'"
        size="sm"
        :aria-pressed="index === activeVariant"
        @click="activeVariant = index"
      >
        {{ label }}
      </UiButton>
    </div>
    <div class="walkthrough">
      <div ref="code" class="listing">
        <CodeBlock :code="variant.code" :language="codeLanguage" :file-name="t('example')" :active-line="step?.line" />
      </div>
      <aside class="tutor" :style="{ paddingTop: `${tutorTop}px` }" aria-live="polite" aria-atomic="true">
        <CodeTutor :title="variant.label" :message="step?.say || variant.outcome" />
      </aside>
    </div>
  </div>
</template>

<style scoped>
.comparison {
  container: code-comparison / inline-size;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
}
.variants {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.walkthrough {
  display: grid;
  grid-template-columns: minmax(0, 1.65fr) minmax(270px, 1fr);
  align-items: start;
  gap: 24px;
}
.listing, .tutor {
  min-width: 0;
}
.tutor {
  padding-bottom: 5px;
  transition: padding-top .25s ease-out;
}
@container code-comparison (max-width: 760px) {
  .walkthrough { grid-template-columns: minmax(0, 1fr); gap: 16px; }
  .tutor { padding-top: 0 !important; }
}
@media (prefers-reduced-motion: reduce) {
  .tutor { transition: none; }
}
</style>
