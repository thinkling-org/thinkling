<script setup>
import { computed, ref, watch } from 'vue'
import { useApp } from '../stores/app.js'
import { getJSON, putJSON } from '../lib/api.js'

const app = useApp()
const catalog = ref(null)
const loading = ref(false)
const error = ref('')
const customModel = ref('')

const provider = computed(() => app.settings.provider)

async function load() {
  loading.value = true
  error.value = ''
  try {
    catalog.value = await getJSON(`/api/providers/${provider.value}/models`)
  } catch (err) {
    catalog.value = null
    error.value = 'Nie udało się pobrać listy modeli.'
  } finally {
    loading.value = false
  }
  const known = catalog.value?.models?.some((m) => m.id === app.settings.model)
  customModel.value = app.settings.model && !known ? app.settings.model : ''
}
watch(provider, load, { immediate: true })

const models = computed(() => catalog.value?.models || [])
const selected = computed(() => models.value.find((m) => m.id === app.settings.model) || null)
const efforts = computed(() => (selected.value ? selected.value.efforts : catalog.value?.efforts) || [])
const placeholder = computed(() => (provider.value === 'claude' ? 'np. claude-opus-5-5' : 'np. gpt-6.2-sol'))

async function save() {
  await putJSON('/api/state', app.persisted())
}

async function setModel(id) {
  app.settings.model = id
  const m = models.value.find((x) => x.id === id)
  if (app.settings.effort && m && !m.efforts.some((e) => e.id === app.settings.effort)) app.settings.effort = ''
  await save()
}

async function setEffort(id) {
  app.settings.effort = id
  await save()
}

async function applyCustom() {
  const v = customModel.value.trim()
  if (v) await setModel(v)
}
</script>

<template>
  <div class="picker">
    <span class="label">Model</span>
    <div v-if="loading && !catalog" class="muted small">Pobieram listę modeli…</div>
    <div v-else class="seg">
      <button class="chip" :aria-pressed="!app.settings.model" @click="setModel('')">{{ catalog?.defaultLabel || 'Domyślny z CLI' }}</button>
      <button
        v-for="m in models"
        :key="m.id"
        class="chip"
        :aria-pressed="app.settings.model === m.id"
        :title="m.description"
        @click="setModel(m.id); customModel = ''"
      >{{ m.label }}</button>
    </div>
    <span v-if="selected?.description" class="muted small">{{ selected.description }}</span>
    <span v-if="error" class="muted small">{{ error }}</span>

    <details class="custom" :open="!!customModel">
      <summary class="small">Inny identyfikator modelu</summary>
      <div class="row">
        <input v-model="customModel" class="input mono" :placeholder="placeholder" aria-label="Własny identyfikator modelu" @keydown.enter="applyCustom" />
        <button class="btn btn-sm" :disabled="!customModel.trim()" @click="applyCustom">Ustaw</button>
      </div>
    </details>

    <template v-if="efforts.length">
      <span class="label">Wysiłek rozumowania (effort)</span>
      <div class="seg">
        <button class="chip" :aria-pressed="!app.settings.effort" @click="setEffort('')">
          Domyślny{{ selected?.defaultEffort ? ` (${efforts.find((e) => e.id === selected.defaultEffort)?.label?.toLowerCase() || selected.defaultEffort})` : '' }}
        </button>
        <button v-for="e in efforts" :key="e.id" class="chip" :aria-pressed="app.settings.effort === e.id" @click="setEffort(e.id)">{{ e.label }}</button>
      </div>
      <span class="muted small">Wyższy effort daje dokładniejsze lekcje i oceny, ale odpowiedzi trwają dłużej i szybciej zużywają limit subskrypcji.</span>
    </template>
  </div>
</template>

<style scoped>
.picker {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.seg {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.row {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 8px;
}
.row .input {
  flex: 1;
  min-width: 200px;
}
.mono {
  font-family: var(--mono);
  font-size: 13px;
}
.small {
  font-size: 13px;
  font-weight: 700;
}
.custom summary {
  cursor: pointer;
  color: var(--text-3);
}
</style>
