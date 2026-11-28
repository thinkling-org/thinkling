<script setup lang="ts">
import { useDesktopUpdates } from '../stores/updates.ts'
import { t } from '../lib/i18n.ts'
import Icon from './Icon.vue'
import { UiButton, UiDialog } from './ui/index.ts'

const updates = useDesktopUpdates()

function download() {
  updates.dismissPrompt()
  void updates.act('download')
}
</script>

<template>
  <UiDialog
    class="update-prompt"
    :open="updates.showStartupPrompt"
    :title="t('An update is available')"
    :description="t('Thinkling {0} is ready to download.', [updates.state?.availableVersion || ''])"
    @update:open="(open) => open || updates.dismissPrompt()"
  >
    <template #icon><Icon name="refresh" :size="30" /></template>
    <p class="prompt-hint">{{ t('You can keep using the app while it downloads. Restart when you are ready.') }}</p>
    <template #actions>
      <UiButton class="prompt-later" autofocus @click="updates.dismissPrompt()">{{ t('Later') }}</UiButton>
      <UiButton variant="primary" class="prompt-download" :disabled="updates.pending" @click="download">{{ t('Download update') }}</UiButton>
    </template>
    <template #footer>
      <a class="prompt-notes" href="https://github.com/thinkling-org/thinkling/releases" target="_blank" rel="noopener noreferrer">{{ t('Release notes') }}</a>
    </template>
  </UiDialog>
</template>

<style scoped>
.prompt-hint { margin: 0; color: var(--text-3); line-height: 1.6; }
.prompt-notes { display: block; margin-top: var(--space-5); font-size: 14px; }
</style>
