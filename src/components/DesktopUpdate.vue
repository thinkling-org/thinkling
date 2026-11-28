<script setup lang="ts">
import { computed } from 'vue'
import { useDesktopUpdates } from '../stores/updates.ts'
import { t } from '../lib/i18n.ts'
import type { UpdateAction } from '../lib/desktop-updates.ts'
import Icon from './Icon.vue'

const { compact = false } = defineProps<{ compact?: boolean }>()
const updates = useDesktopUpdates()
const state = computed(() => updates.state)
const visible = computed(() => state.value && (!compact
  || ['available', 'downloading', 'downloaded', 'installing'].includes(state.value.status)
  || (state.value.status === 'error' && state.value.retry !== 'check')))
const busy = computed(() => updates.pending || ['checking', 'downloading', 'installing'].includes(state.value?.status))
const label = computed(() => {
  switch (state.value?.status) {
    case 'available': return t('Update available · {0}', [state.value.availableVersion])
    case 'downloading': return t('Downloading… {0}%', [state.value.percent || 0])
    case 'downloaded': return t('Restart and update')
    case 'installing': return t('Saving and restarting…')
    case 'checking': return t('Checking for updates…')
    case 'error': return t('Try again')
    default: return t('Check for updates')
  }
})
const error = computed(() => {
  if (state.value?.status !== 'error') return ''
  switch (state.value.retry) {
    case 'download': return t('Could not download the update. Check your connection and try again.')
    case 'install': return t('Could not restart for the update. Your progress must be saved before restarting. Try again.')
    default: return t('Could not check for updates. Check your connection and try again.')
  }
})
const action = computed<UpdateAction>(() => {
  if (state.value?.status === 'error') return state.value.retry || 'check'
  if (state.value?.status === 'available') return 'download'
  if (state.value?.status === 'downloaded') return 'install'
  return 'check'
})
</script>

<template>
  <section v-if="visible" class="desktop-update" :class="{ compact }" :aria-label="t('Application updates')">
    <template v-if="!compact">
      <h2 class="heading">{{ t('Application updates') }}</h2>
      <p class="muted">Thinkling {{ state.currentVersion }}</p>
      <p v-if="state.status === 'disabled'" class="muted">{{ t('Automatic updates are available in the Windows installer and the Linux AppImage. Download other versions from the releases page.') }}</p>
      <p v-else-if="state.status === 'current'" role="status" class="muted">{{ t('You are using the latest version.') }}</p>
      <p v-else-if="state.status === 'downloaded'" class="muted">{{ t('Version {0} is ready. Restart when you are ready; your progress will be saved.', [state.availableVersion]) }}</p>
    </template>
    <div v-if="state.status !== 'disabled'" class="controls">
      <button
        type="button"
        class="btn btn-sm update-button"
        :class="{ 'btn-primary': state.status === 'available' || state.status === 'downloaded' }"
        :disabled="busy"
        :title="error || (state.status === 'downloaded' ? t('Your progress will be saved before restarting.') : undefined)"
        @click="updates.act(action)"
      >
        <Icon name="refresh" :size="18" />
        {{ label }}
      </button>
      <a v-if="!compact" href="https://github.com/thinkling-org/thinkling/releases" target="_blank" rel="noopener noreferrer">{{ t('Release notes') }}</a>
    </div>
    <progress v-if="state.status === 'downloading'" class="download-progress" :value="state.percent || 0" max="100" :aria-label="t('Update download progress')" />
    <p v-if="error" role="alert" class="update-error">{{ error }}</p>
    <a v-if="state.status === 'disabled' && !compact" href="https://github.com/thinkling-org/thinkling/releases" target="_blank" rel="noopener noreferrer">{{ t('Release notes') }}</a>
  </section>
</template>

<style scoped>
.desktop-update { display: flex; flex-direction: column; gap: 12px; }
.heading { font-size: 20px; }
.desktop-update p { margin: 0; line-height: 1.5; font-weight: 600; }
.controls { display: flex; align-items: center; flex-wrap: wrap; gap: 14px; }
.download-progress { width: 100%; max-width: 320px; height: 6px; accent-color: var(--purple); }
.update-error { color: var(--red-light); font-size: 13px; }
.compact { max-width: 340px; gap: 6px; }
.compact .update-button { padding: 7px 12px; font-size: 13px; }
.compact .update-error { max-width: 300px; }
@media (max-width: 600px) {
  .compact { max-width: 100%; }
}
</style>
