<script setup>
import { t } from '../lib/i18n.js'
import Icon from './Icon.vue'

defineProps({
  testing: Boolean,
  result: Object,
})
defineEmits(['test'])
</script>

<template>
  <button class="btn btn-primary btn-sm" :disabled="testing" @click="$emit('test')">
    <span v-if="testing" class="spinner" />
    {{ t('Test connection') }}
  </button>
  <span v-if="result" class="result" :class="result.ok ? 'ok' : 'bad'" role="status">
    <Icon :name="result.ok ? 'check' : 'x'" :size="18" :stroke="3" />{{ result.text }}
  </span>
</template>

<style scoped>
.spinner {
  width: 16px;
  height: 16px;
  border-width: 2px;
  border-color: #ffffff55;
  border-top-color: #fff;
}
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
