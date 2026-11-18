<script setup>
import { computed } from 'vue'
import { useApp } from '../stores/app.js'

const props = defineProps({ busy: { type: Boolean, default: false }, label: { type: String, default: '' }, compact: Boolean })
const app = useApp()

const state = computed(() => {
  const p = app.activeProvider
  const name = app.settings.provider === 'codex' ? 'Codex' : 'Claude'
  if (!app.status) return { color: 'var(--muted)', text: `Łączę z ${name}…`, sub: '' }
  if (props.busy) return { color: 'var(--yellow)', text: props.label || `${name} generuje…`, sub: '' }
  if (!p?.available) return { color: 'var(--red)', text: `${name} niedostępny`, sub: 'sprawdź Ustawienia' }
  return { color: 'var(--green)', text: `${name} połączony`, sub: app.settings.model || p.version?.split(' ')[0] || '' }
})
</script>

<template>
  <RouterLink to="/settings" class="pill" :class="{ compact }" :title="app.activeProvider?.path || ''">
    <span class="dot" :style="{ background: state.color, boxShadow: `0 0 10px ${state.color}` }" />
    <span class="txt">{{ state.text }}</span>
    <span v-if="state.sub" class="sub">{{ state.sub }}</span>
    <slot />
  </RouterLink>
</template>

<style scoped>
.pill {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  background: var(--surface);
  border: 2px solid var(--border);
  border-radius: 999px;
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
  text-decoration: none;
  white-space: nowrap;
}
.pill:hover {
  color: var(--text);
  border-color: #3a4147;
}
.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex: none;
}
.sub {
  color: var(--muted);
  font-family: var(--mono);
  font-weight: 500;
  font-size: 13px;
}
.compact {
  padding: 6px 12px;
  font-size: 13px;
}
</style>
