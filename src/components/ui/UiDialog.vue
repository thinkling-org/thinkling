<script setup lang="ts">
import { useId, useTemplateRef, watchEffect } from 'vue'

/**
 * Modal built on the native <dialog>: the browser keeps focus inside, makes the
 * background inert and closes on Escape. Bind with v-model:open.
 * Put `autofocus` on the control that should receive focus first.
 */
const open = defineModel<boolean>('open', { default: false })
defineProps<{
  title: string
  description?: string
}>()
defineSlots<{
  icon?(): unknown
  default?(): unknown
  actions?(): unknown
  footer?(): unknown
}>()

const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const id = useId()
const titleId = `dialog-title-${id}`
const descriptionId = `dialog-description-${id}`

watchEffect(() => {
  const element = dialog.value
  if (!element) return
  if (open.value && !element.open) element.showModal()
  else if (!open.value && element.open) element.close()
}, { flush: 'post' })

// Escape fires `cancel`, dialog.close() and form[method=dialog] fire `close`.
function dismiss() {
  if (open.value) open.value = false
}
</script>

<template>
  <dialog
    ref="dialog"
    class="ui-dialog"
    :aria-labelledby="titleId"
    :aria-describedby="description ? descriptionId : undefined"
    @cancel="dismiss"
    @close="dismiss"
  >
    <div v-if="$slots.icon" class="ui-dialog-icon"><slot name="icon" /></div>
    <h2 :id="titleId" class="ui-dialog-title">{{ title }}</h2>
    <p v-if="description" :id="descriptionId" class="ui-dialog-description">{{ description }}</p>
    <slot />
    <div v-if="$slots.actions" class="ui-dialog-actions"><slot name="actions" /></div>
    <slot name="footer" />
  </dialog>
</template>

<style scoped>
.ui-dialog {
  width: min(480px, calc(100vw - 32px));
  padding: var(--space-8);
  border: var(--border-width) solid var(--border);
  border-radius: var(--radius-4xl);
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 24px 80px #0008;
}
.ui-dialog::backdrop {
  background: #000b;
}
.ui-dialog-icon {
  display: grid;
  place-items: center;
  width: 60px;
  height: 60px;
  margin-bottom: var(--space-5);
  border-radius: var(--radius-3xl);
  background: var(--color-accent-soft);
  color: var(--color-accent-ink);
}
.ui-dialog-title {
  font-size: 26px;
}
.ui-dialog-description {
  margin: var(--space-3) 0;
  font-weight: var(--weight-bold);
  line-height: 1.5;
}
.ui-dialog-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-3);
  margin-top: 28px;
}
@media (max-width: 480px) {
  .ui-dialog {
    padding: var(--space-6);
  }
  .ui-dialog-actions > :slotted(*) {
    flex: 1;
    padding-inline: var(--space-4);
  }
}
</style>
