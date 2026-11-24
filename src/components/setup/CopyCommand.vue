<script setup lang="ts">
import { onScopeDispose, shallowRef } from 'vue'
import { t } from '../../lib/i18n.ts'

const props = defineProps({ command: { type: String, required: true } })
const copied = shallowRef('')
let reset
let disposed = false

async function copy() {
  const command = props.command
  try {
    await navigator.clipboard.writeText(command)
    if (disposed) return
    copied.value = command
    clearTimeout(reset)
    reset = setTimeout(() => { copied.value = '' }, 1500)
  } catch {
    // The command stays selectable if clipboard access is unavailable.
  }
}

onScopeDispose(() => {
  disposed = true
  clearTimeout(reset)
})
</script>

<template>
  <div class="command">
    <code>{{ command }}</code>
    <button class="btn btn-sm" @click="copy">{{ copied === command ? t('Copied') : t('Copy') }}</button>
  </div>
</template>

<style scoped>
.command {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--bg-deep);
  border: 2px solid var(--border);
  border-radius: 10px;
  padding: 6px 6px 6px 12px;
}
code {
  flex: 1;
  font-family: var(--mono);
  font-size: 13px;
  color: var(--code-ink);
  overflow-x: auto;
  white-space: nowrap;
}
</style>
