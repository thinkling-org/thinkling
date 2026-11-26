<script setup lang="ts">
import { useId, useTemplateRef, watchEffect } from 'vue'
import { useDesktopUpdates } from '../stores/updates.ts'
import { t } from '../lib/i18n.ts'
import Icon from './Icon.vue'

const updates = useDesktopUpdates()
const modal = useTemplateRef<HTMLDialogElement>('modal')
const titleId = `update-title-${useId()}`
const descriptionId = `update-description-${useId()}`

// Native dialogs keep focus inside the popup, make the background inert and support Escape.
watchEffect(() => {
  const dialog = modal.value
  if (!dialog) return
  if (updates.showStartupPrompt && !dialog.open) dialog.showModal()
  else if (!updates.showStartupPrompt && dialog.open) dialog.close()
}, { flush: 'post' })

function download() {
  updates.dismissPrompt()
  void updates.act('download')
}
</script>

<template>
  <dialog ref="modal" class="update-prompt" :aria-labelledby="titleId" :aria-describedby="descriptionId" @cancel="updates.dismissPrompt()" @close="updates.dismissPrompt()">
    <div class="prompt-mark"><Icon name="refresh" :size="30" /></div>
    <h2 :id="titleId" class="prompt-title">{{ t('An update is available') }}</h2>
    <p :id="descriptionId" class="prompt-description">{{ t('Thinkling {0} is ready to download.', [updates.state?.availableVersion || '']) }}</p>
    <p class="prompt-hint">{{ t('You can keep using the app while it downloads. Restart when you are ready.') }}</p>
    <div class="prompt-actions">
      <button type="button" class="btn prompt-later" autofocus @click="updates.dismissPrompt()">{{ t('Later') }}</button>
      <button type="button" class="btn btn-primary prompt-download" :disabled="updates.pending" @click="download">{{ t('Download update') }}</button>
    </div>
    <a class="prompt-notes" href="https://github.com/thinkling-org/thinkling/releases" target="_blank" rel="noopener noreferrer">{{ t('Release notes') }}</a>
  </dialog>
</template>

<style scoped>
.update-prompt {
  width: min(480px, calc(100vw - 32px));
  padding: 32px;
  border: 2px solid var(--border);
  border-radius: 24px;
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 24px 80px #0008;
}
.update-prompt::backdrop { background: #000b; }
.prompt-mark {
  display: grid;
  place-items: center;
  width: 60px;
  height: 60px;
  margin-bottom: 20px;
  border-radius: 18px;
  background: var(--purple-soft);
  color: var(--purple-light);
}
.prompt-title { font-size: 26px; }
.prompt-description { margin: 12px 0; font-weight: 800; line-height: 1.5; }
.prompt-hint { margin: 0; color: var(--text-3); line-height: 1.6; }
.prompt-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 12px; margin-top: 28px; }
.prompt-notes { display: block; margin-top: 20px; font-size: 14px; }
@media (max-width: 480px) {
  .update-prompt { padding: 24px; }
  .prompt-actions .btn { flex: 1; padding-inline: 16px; }
}
</style>
