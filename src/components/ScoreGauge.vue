<script setup>
import { t } from '../lib/i18n.js'
import { computed } from 'vue'

const props = defineProps({ score: { type: Number, default: 0 }, delta: { type: Number, default: 0 } })
const LEN = Math.PI * 80 // Arc length at radius 80.
const dash = computed(() => `${(Math.min(1000, Math.max(0, props.score)) / 1000) * LEN} ${LEN}`)
const label = computed(() => {
  const s = props.score
  if (!s) return t('Do your first lesson')
  if (s < 400) return t('Warm-up')
  if (s < 600) return t('You\'re making progress')
  if (s < 800) return t('You\'re doing great!')
  return t('Expert!')
})
</script>

<template>
  <div class="gauge">
    <svg role="img" :aria-label="t('Score {0} out of 1000', [score])" width="240" height="130" viewBox="0 0 200 110">
      <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="#2C3237" stroke-width="14" stroke-linecap="round" />
      <path
        v-if="score > 0"
        d="M20 100 A80 80 0 0 1 180 100"
        fill="none"
        stroke="#3DDC84"
        stroke-width="14"
        stroke-linecap="round"
        :stroke-dasharray="dash"
        style="transition: stroke-dasharray 0.8s ease"
      />
    </svg>
    <div class="num">
      <span class="v">{{ score }}</span>
      <span v-if="delta" class="d" :class="{ neg: delta < 0 }">{{ delta > 0 ? '▲' : '▼' }} {{ Math.abs(delta) }}</span>
    </div>
    <span class="lbl">{{ label }}</span>
  </div>
</template>

<style scoped>
.gauge {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.num {
  margin-top: -62px;
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.v {
  font-size: 44px;
  font-weight: 900;
}
.d {
  font-size: 15px;
  font-weight: 800;
  color: var(--green);
}
.d.neg {
  color: var(--red-light);
}
.lbl {
  font-size: 15px;
  color: var(--text-3);
  font-weight: 700;
}
</style>
