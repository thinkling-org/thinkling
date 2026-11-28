<script setup lang="ts">
import { t } from '../lib/i18n.ts'
import { computed, ref, watch } from 'vue'
import { useApp } from '../stores/app.ts'
import { getJSON } from '../lib/api.ts'
import { UiButton, UiChoiceGroup, UiInput } from './ui/index.ts'

const app = useApp()
const catalog = ref(null)
const loading = ref(false)
const error = ref('')
const customModel = ref('')

const provider = computed(() => app.settings.provider)

async function load([id, locale], _old, onCleanup) {
  let active = true
  onCleanup(() => { active = false })
  loading.value = true
  error.value = ''
  try {
    await app.flushSave().catch(() => {})
    if (!active || locale !== app.settings.locale) return
    const nextCatalog = await getJSON(`/api/providers/${id}/models`)
    if (active) catalog.value = nextCatalog
  } catch (err) {
    if (!active) return
    catalog.value = null
    error.value = t('Couldn\'t load the model list.')
  } finally {
    if (active) loading.value = false
  }
  if (!active) return
  const known = catalog.value?.models?.some((m) => m.id === app.settings.model)
  customModel.value = app.settings.model && !known ? app.settings.model : ''
}
watch([provider, () => app.settings.locale], load, { immediate: true })

const models = computed(() => catalog.value?.models || [])
const selected = computed(() => models.value.find((m) => m.id === app.settings.model) || null)
const efforts = computed(() => (selected.value ? selected.value.efforts : catalog.value?.efforts) || [])
const modelOptions = computed(() => [
  { value: '', label: catalog.value?.defaultLabel || t('CLI default') },
  ...models.value.map((m) => ({ value: m.id, label: m.label, title: m.description })),
])
const effortOptions = computed(() => {
  const fallback = selected.value?.defaultEffort
  const fallbackLabel = fallback ? efforts.value.find((e) => e.id === fallback)?.label?.toLowerCase() || fallback : ''
  return [
    { value: '', label: fallbackLabel ? `${t('Default')} (${fallbackLabel})` : t('Default') },
    ...efforts.value.map((e) => ({ value: e.id, label: e.label })),
  ]
})
const placeholder = computed(() => (provider.value === 'claude' ? t('e.g. claude-opus-5-5') : t('e.g. gpt-6.2-sol')))

async function setModel(id) {
  app.settings.model = id
  const m = models.value.find((x) => x.id === id)
  if (app.settings.effort && m && !m.efforts.some((e) => e.id === app.settings.effort)) app.settings.effort = ''
  await app.saveNow()
}

async function setEffort(id) {
  app.settings.effort = id
  await app.saveNow()
}

async function applyCustom() {
  const v = customModel.value.trim()
  if (v) await setModel(v)
}
</script>

<template>
  <div class="picker">
    <span class="label">Model</span>
    <div v-if="loading && !catalog" class="muted small">{{ t('Loading models…') }}</div>
    <UiChoiceGroup
      v-else
      :model-value="app.settings.model || ''"
      :options="modelOptions"
      label="Model"
      @update:model-value="(id) => { setModel(id); customModel = '' }"
    />
    <span v-if="selected?.description" class="muted small">{{ selected.description }}</span>
    <span v-if="error" class="muted small">{{ error }}</span>

    <details class="custom" :open="!!customModel">
      <summary class="small">{{ t('Other model ID') }}</summary>
      <div class="row">
        <UiInput v-model="customModel" class="mono" :placeholder="placeholder" :aria-label="t('Custom model ID')" @keydown.enter="applyCustom" />
        <UiButton size="sm" :disabled="!customModel.trim()" @click="applyCustom">{{ t('Set') }}</UiButton>
      </div>
    </details>

    <template v-if="efforts.length">
      <span class="label">{{ t('Reasoning effort') }}</span>
      <UiChoiceGroup
        :model-value="app.settings.effort || ''"
        :options="effortOptions"
        :label="t('Reasoning effort')"
        @update:model-value="setEffort"
      />
      <span class="muted small">{{ t('Higher effort can improve lessons and feedback, but responses take longer and use more of your subscription allowance.') }}</span>
    </template>
  </div>
</template>

<style scoped>
.picker {
  display: flex;
  flex-direction: column;
  gap: 10px;
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
