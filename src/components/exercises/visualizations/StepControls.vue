<script setup>
import Icon from '../../Icon.vue'

defineProps({ total: { type: Number, required: true } })
const step = defineModel({ type: Number, default: 0 })
</script>

<template>
  <div class="step-controls" @keydown.enter.stop>
    <button type="button" class="btn btn-ghost btn-sm" :disabled="step === 0" aria-label="Poprzedni krok" @click="step--">
      <Icon name="arrow-left" :size="16" :stroke="2.6" />
    </button>
    <button type="button" class="btn btn-primary btn-sm" :disabled="step >= total - 1" @click="step++">
      Następny krok<Icon name="arrow-right" :size="16" :stroke="2.6" />
    </button>
    <button v-if="step > 0" type="button" class="btn btn-ghost btn-sm" @click="step = 0">Od początku</button>
    <span class="counter" aria-live="polite">Krok {{ step + 1 }} / {{ total }}</span>
  </div>
</template>

<style scoped>
.step-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.counter {
  margin-left: auto;
  color: var(--muted);
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-variant-numeric: tabular-nums;
}
</style>
