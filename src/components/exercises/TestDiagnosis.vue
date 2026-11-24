<script setup lang="ts">
import { t } from '../../lib/i18n.ts'
import { computed } from 'vue'
import { diagnoseRun, visible } from '../../lib/test-diagnosis.ts'

const props = defineProps({
  run: { type: Object, default: null },
  code: { type: String, default: '' },
})
const diagnosis = computed(() => diagnoseRun(props.run, props.code))

// Show a short excerpt on either side of the highlighted difference.
function window(text, start, length) {
  const from = Math.max(0, start - 24)
  const to = Math.min(text.length, start + length + 16)
  return {
    before: (from ? '…' : '') + visible(text.slice(from, start)),
    mark: visible(text.slice(start, start + length)),
    after: visible(text.slice(start + length, to)) + (to < text.length ? '…' : ''),
  }
}
const rows = computed(() => {
  const d = diagnosis.value
  if (!d) return []
  const { start, missing, extra } = d.diff
  return [
    { label: t('Expected'), kind: 'want', ...window(d.expected, start, missing.length) },
    { label: t('Your result'), kind: 'got', ...window(d.got, start, extra.length) },
  ]
})
</script>

<template>
  <div v-if="diagnosis" class="diagnosis" :class="{ near: diagnosis.nearMiss }" role="status">
    <div class="speaker">
      <svg class="mascot" aria-hidden="true" width="34" height="34" viewBox="0 0 64 64"><polygon points="32,4 56,18 56,46 32,60 8,46 8,18" fill="#7C5CFF" /><polygon points="32,4 56,18 32,30 8,18" fill="#A08BFF" /><ellipse cx="23" cy="36" rx="6.5" ry="7.5" fill="#fff" /><ellipse cx="41" cy="36" rx="6.5" ry="7.5" fill="#fff" /><circle cx="21" cy="37" r="3.4" fill="#15181B" /><circle cx="39" cy="37" r="3.4" fill="#15181B" /></svg>
      <div class="bubble">
        <strong>{{ diagnosis.headline }}</strong>
        <span>{{ diagnosis.message }}</span>
      </div>
    </div>
    <dl class="diff">
      <div v-for="row in rows" :key="row.kind" :class="row.kind">
        <dt>{{ row.label }}</dt>
        <dd><code>{{ row.before }}<mark v-if="row.mark">{{ row.mark }}</mark><mark v-else class="gap" :aria-label="t('nothing here')">‸</mark>{{ row.after }}</code></dd>
      </div>
    </dl>
    <p v-if="diagnosis.location" class="where">
      {{ t('Likely line') }} {{ diagnosis.location.line }}: <code>{{ diagnosis.location.text }}</code>
    </p>
    <p class="test-name">{{ t('Test:') }} {{ diagnosis.name }} {{ t('· ↵ marks a newline') }}</p>
  </div>
</template>

<style scoped>
.diagnosis {
  display: grid;
  gap: 10px;
  margin-bottom: 10px;
  padding: 12px 14px;
  border: 2px solid var(--border);
  border-radius: 14px;
  background: var(--surface-2);
  font-family: var(--font);
  white-space: normal;
}
.diagnosis.near {
  border-color: var(--yellow-border);
  background: var(--yellow-bg);
}
.speaker {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.mascot {
  flex: none;
  filter: drop-shadow(0 0 8px color-mix(in srgb, var(--purple) 55%, transparent));
}
.bubble {
  display: grid;
  gap: 2px;
  padding: 8px 12px;
  border-radius: 12px;
  background: var(--text);
  color: var(--bg);
  font-size: 14px;
  line-height: 1.4;
}
.diff {
  display: grid;
  gap: 4px;
  margin: 0;
}
.diff > div {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  gap: 8px;
  align-items: baseline;
}
dt {
  color: var(--muted);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
dd {
  margin: 0;
  overflow-x: auto;
}
dd code {
  font-family: var(--mono);
  font-size: 13px;
  white-space: pre;
  color: var(--text-2);
}
mark {
  padding: 0 2px;
  border-radius: 4px;
  font-weight: 700;
}
.want mark {
  background: var(--green-soft);
  color: var(--green-light);
  box-shadow: inset 0 0 0 1px var(--green);
}
.got mark {
  background: var(--red-soft);
  color: var(--red-light);
  box-shadow: inset 0 0 0 1px var(--red);
}
mark.gap {
  background: none;
  box-shadow: none;
  color: var(--muted);
}
.where,
.test-name {
  margin: 0;
  font-size: 13px;
  color: var(--text-3);
}
.where code {
  font-family: var(--mono);
  color: var(--yellow-light);
  overflow-wrap: anywhere;
}
.test-name {
  color: var(--faint);
  font-size: 12px;
}
</style>
