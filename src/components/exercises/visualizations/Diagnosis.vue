<script setup>
import { t } from '../../../lib/i18n.js'
import { computed, ref, watch } from 'vue'
import Markdown from '../../Markdown.vue'

const props = defineProps({ config: { type: Object, required: true } })
const measured = ref(new Set())
const pick = ref(null)
watch(() => props.config, () => {
  measured.value = new Set()
  pick.value = null
})

const choice = computed(() => (pick.value === null ? null : props.config.options[pick.value]))
const solved = computed(() => !!choice.value?.correct)

function measure(index) {
  measured.value = new Set([...measured.value, index])
}
</script>

<template>
  <section class="card viz diagnosis" :aria-label="t('Diagnosis and measurement')">
    <div class="head">
      <Markdown class="instruction" :src="config.instruction" />
      <span class="count">{{ t('Checks:') }} <strong>{{ measured.size }}</strong> / {{ config.checks.length }}</span>
    </div>
    <p class="symptom"><span class="label">{{ t('Symptom') }}</span> {{ config.symptom }}</p>
    <ol class="checks">
      <li v-for="(check, k) in config.checks" :key="check.name" :class="measured.has(k) && (check.ok ? 'ok' : 'bad')">
        <strong>{{ check.name }}</strong>
        <code v-if="check.detail">{{ check.detail }}</code>
        <span v-if="measured.has(k)" class="result" aria-live="polite">{{ check.result }}</span>
        <button v-else type="button" class="btn btn-ghost btn-sm measure" @click="measure(k)">{{ check.action }}</button>
      </li>
    </ol>
    <div class="diagnose">
      <span class="label">{{ t('Your diagnosis') }}</span>
      <div class="options" role="radiogroup" :aria-label="t('Diagnosis')">
        <button
          v-for="(option, k) in config.options"
          :key="option.text"
          type="button"
          role="radio"
          class="option"
          :class="pick === k && (option.correct ? 'ok' : 'bad')"
          :aria-checked="pick === k"
          :disabled="solved && pick !== k"
          @click="pick = k"
        >{{ option.text }}</button>
      </div>
      <p v-if="choice" class="feedback" :class="{ ok: solved }" aria-live="polite">{{ choice.why }}</p>
      <p v-else class="tip">
        {{ measured.size < 2 ? t('Run the checks in order. Each normal result narrows down the fault.') : t('Which check explains the symptom? Choose a diagnosis.') }}
      </p>
    </div>
  </section>
</template>

<style scoped>
.diagnosis {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
  padding: clamp(12px, 3vw, 20px);
}
.head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px 16px;
}
.instruction {
  flex: 1;
  min-width: 220px;
  color: var(--text-2);
}
.count {
  padding: 6px 12px;
  border: 2px solid var(--border);
  border-radius: 12px;
  font-weight: 900;
  font-size: 14px;
}
.count strong {
  color: var(--yellow-light);
}
.symptom {
  margin: 0;
  padding: 10px 14px;
  border-radius: 12px;
  background: var(--red-bg);
  color: var(--red-light);
  font-weight: 800;
}
.symptom .label {
  margin-right: 6px;
}
.checks {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
  counter-reset: check;
}
.checks li {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 124px;
  padding: 12px;
  border: 2px solid var(--border);
  border-bottom-width: 5px;
  border-radius: 16px;
  background: var(--surface-2);
}
.checks li.ok {
  border-color: var(--green-border);
}
.checks li.bad {
  border-color: var(--red-border);
}
.checks code {
  color: var(--muted);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.measure,
.result {
  margin-top: auto;
}
.result {
  padding: 6px 8px;
  border-radius: 8px;
  font-family: var(--mono);
  font-size: 13px;
  font-weight: 700;
  overflow-wrap: anywhere;
  animation: enter 0.25s ease-out;
}
.ok .result {
  background: var(--green-soft);
  color: var(--green-light);
}
.bad .result {
  background: var(--red-soft);
  color: var(--red-light);
}
.diagnose {
  display: grid;
  gap: 8px;
}
.diagnose > .label {
  color: var(--muted);
}
.options {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
  gap: 8px;
}
.option {
  min-height: 48px;
  padding: 10px 14px;
  border: 2px solid var(--border);
  border-bottom-width: 4px;
  border-radius: 14px;
  background: var(--surface);
  font-weight: 800;
  font-size: 15px;
  text-align: left;
  cursor: pointer;
}
.option:disabled {
  cursor: default;
  opacity: 0.55;
}
.option.ok {
  border-color: var(--green);
  background: var(--green-soft);
  color: var(--green-light);
}
.option.bad {
  border-color: var(--red);
  background: var(--red-soft);
  color: var(--red-light);
}
.feedback,
.tip {
  margin: 0;
  padding: 10px 14px;
  border-radius: 12px;
  font-weight: 700;
  line-height: 1.45;
}
.feedback {
  background: var(--yellow-bg);
  color: var(--yellow-light);
}
.feedback.ok {
  background: var(--green-soft);
  color: var(--green-light);
}
.tip {
  background: var(--purple-soft);
  color: var(--text-2);
}
@keyframes enter {
  from { transform: translateY(4px); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .result { animation: none; }
}
</style>
