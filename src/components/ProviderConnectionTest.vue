<script setup lang="ts">
import { t } from '../lib/i18n.ts'
import Icon from './Icon.vue'
import { UiButton, UiSpinner } from './ui/index.ts'

defineProps({
  testing: Boolean,
  result: Object,
})
defineEmits(['test'])
</script>

<template>
  <UiButton variant="primary" size="sm" :disabled="testing" @click="$emit('test')">
    <UiSpinner v-if="testing" />
    {{ t('Test connection') }}
  </UiButton>
  <span v-if="result" class="result" :class="result.ok ? 'ok' : 'bad'" role="status">
    <Icon :name="result.ok ? 'check' : 'x'" :size="18" :stroke="3" />{{ result.text }}
  </span>
</template>

<style scoped>
.result {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 800;
  font-size: 14px;
}
.result.ok {
  color: var(--green-light);
}
.result.bad {
  color: var(--red-light);
}
</style>
