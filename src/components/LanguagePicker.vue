<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { useApp } from '../stores/app.ts'
import { INTERFACE_LANGUAGES, languageName } from '../lib/languages.ts'
import { t, uiLocale } from '../lib/i18n.ts'

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
      <span class="label">{{ t('Language') }}</span>
      <select class="input" :value="selected" :disabled="saving" @change="change">
        <option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option>
      </select>
    </label>
    <p v-if="failed" class="language-error" role="alert">{{ t('Couldn\'t save the language. Try again.') }}</p>
    <p v-if="props.explain" class="muted">{{ t('Language for the interface and new AI responses. Saved lessons and flashcards stay in the language in which they were created.') }}</p>
    <p v-if="props.explain && selected !== uiLocale()" class="muted">{{ t('The interface is displayed in English for this language.') }}</p>
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
