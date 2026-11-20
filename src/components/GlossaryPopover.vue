<script setup>
import { computed, nextTick, ref, useId, watch } from 'vue'
import { activeTerm, closeCodeDefinitionSoon, glossaryEntry, keepCodeDefinitionOpen } from '../lib/glossary.js'

const definition = computed(() => glossaryEntry(activeTerm.value?.dataset.glossaryTerm))
const panel = ref(null)
const panelId = useId()
const position = ref(null)
const close = () => { activeTerm.value = null }

function keepOpen() {
  if (activeTerm.value?.classList.contains('code-term')) keepCodeDefinitionOpen()
}

function leavePanel() {
  const term = activeTerm.value
  if (term?.classList.contains('code-term')) closeCodeDefinitionSoon(term)
}

watch(activeTerm, async (term, _, onCleanup) => {
  position.value = null
  if (!term) return
  term.setAttribute('aria-expanded', 'true')
  term.setAttribute('aria-controls', panelId)
  if (term.classList.contains('code-term')) term.setAttribute('aria-describedby', panelId)

  const outside = (event) => {
    if (!term.contains(event.target) && !panel.value?.contains(event.target)) close()
  }
  const escape = (event) => {
    if (event.key === 'Escape') close()
  }
  document.addEventListener('pointerdown', outside)
  document.addEventListener('keydown', escape)
  window.addEventListener('resize', close)
  window.addEventListener('scroll', close, true)
  onCleanup(() => {
    term.setAttribute('aria-expanded', 'false')
    term.removeAttribute('aria-controls')
    if (term.classList.contains('code-term')) term.removeAttribute('aria-describedby')
    document.removeEventListener('pointerdown', outside)
    document.removeEventListener('keydown', escape)
    window.removeEventListener('resize', close)
    window.removeEventListener('scroll', close, true)
  })

  await nextTick()
  if (activeTerm.value !== term || !panel.value) return
  const anchor = term.getBoundingClientRect()
  const { width, height } = panel.value.getBoundingClientRect()
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8))
  const below = anchor.bottom + 8
  const top = below + height <= window.innerHeight - 8 ? below : Math.max(8, anchor.top - height - 8)
  position.value = { left: `${left}px`, top: `${top}px` }
})
</script>

<template>
  <Teleport to="body">
    <div v-if="definition" :id="panelId" ref="panel" class="glossary-panel"
      :style="position || { visibility: 'hidden' }" role="status" @pointerenter="keepOpen" @pointerleave="leavePanel">
      <strong>{{ definition.title }}</strong>
      <p>{{ definition.definition }}</p>
    </div>
  </Teleport>
</template>

<style scoped>
.glossary-panel {
  position: fixed;
  z-index: 80;
  width: min(320px, calc(100vw - 16px));
  padding: 12px 14px;
  border: 1px solid var(--purple-ring);
  border-radius: 12px;
  background: var(--surface-2);
  box-shadow: 0 12px 30px #0006;
  color: var(--text-2);
  font-size: 14px;
  line-height: 1.45;
}
.glossary-panel strong {
  color: var(--purple-light);
}
.glossary-panel p {
  margin: 4px 0 0;
}
</style>
