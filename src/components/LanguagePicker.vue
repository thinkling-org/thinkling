<script setup>
import { computed, shallowRef } from 'vue'
import { useApp } from '../stores/app.js'
import { INTERFACE_LANGUAGES, languageName } from '../lib/languages.js'
import { t, uiLocale } from '../lib/i18n.js'

const props = defineProps({ explain: Boolean })
const app = useApp()
const saving = shallowRef(false)
const failed = shallowRef(false)

const selected = computed(() => {
  const locale = app.settings.locale
  const base = locale.split('-')[0]
  return INTERFACE_LANGUAGES.some(({ value }) => value === base) ? base : locale
})
const options = computed(() => INTERFACE_LANGUAGES.some(({ value }) => value === selected.value)
  ? INTERFACE_LANGUAGES
  : [...INTERFACE_LANGUAGES, { value: selected.value, label: languageName(selected.value, uiLocale()) }])

async function change(event) {
  failed.value = false
  saving.value = true
  try {
    await app.changeLocale(event.target.value)
  } catch {
    failed.value = true
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="language-picker">
    <label class="language-field">
      <span class="label">{{ t('Język') }}</span>
      <select class="input" :value="selected" :disabled="saving" @change="change">
        <option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option>
      </select>
    </label>
    <p v-if="failed" class="language-error" role="alert">{{ t('Nie udało się zapisać języka. Spróbuj ponownie.') }}</p>
    <p v-if="props.explain" class="muted">{{ t('Język interfejsu i nowych odpowiedzi AI. Zapisane lekcje i fiszki są wyświetlane w języku, w którym powstały.') }}</p>
    <p v-if="props.explain && selected !== uiLocale()" class="muted">{{ t('Dla tego języka interfejs jest wyświetlany po angielsku.') }}</p>
  </div>
</template>

<style scoped>
.language-picker {
  display: grid;
  gap: 8px;
  min-width: 0;
}
.language-field {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
}
.language-field select {
  width: auto;
  min-width: 120px;
}
.language-picker p {
  margin: 0;
  font-size: 14px;
}
.language-error {
  color: var(--red-light);
}
</style>
