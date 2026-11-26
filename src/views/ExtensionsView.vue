<script setup lang="ts">
import { t } from '../lib/i18n.ts'
import { computed, onMounted, ref, useTemplateRef } from 'vue'
import AppShell from '../components/AppShell.vue'
import Icon from '../components/Icon.vue'
import {
  installPluginFile, installedPlugins, loadInstalledBlocks, pluginProblems, pluginState, removePlugin, setPluginEnabled,
} from '../blocks/installed.ts'

const picker = useTemplateRef<HTMLInputElement>('picker')
/** A chosen file waiting for the learner to confirm they trust it. */
const pending = ref<File | null>(null)
const busy = ref(false)
const dragging = ref(false)
const message = ref<{ kind: 'ok' | 'error'; text: string; detail?: string } | null>(null)
/** Folder whose Remove button was pressed once and now asks for confirmation. */
const confirmRemove = ref<string | null>(null)

const plugins = computed(() => [...installedPlugins].sort((a, b) => a.name.localeCompare(b.name)))

onMounted(() => loadInstalledBlocks())

function choose(file: File | undefined) {
  message.value = null
  if (!file) return
  if (!/\.(thinkling|zip)$/i.test(file.name)) {
    message.value = { kind: 'error', text: t('Choose a .thinkling file.') }
    return
  }
  pending.value = file
}

function onPick(event: Event) {
  const input = event.target as HTMLInputElement
  choose(input.files?.[0])
  input.value = ''
}

function onDrop(event: DragEvent) {
  dragging.value = false
  choose(event.dataTransfer?.files?.[0])
}

async function run(action: () => Promise<void>) {
  busy.value = true
  try {
    await action()
  } catch (err) {
    message.value = { kind: 'error', text: t('The action failed.'), detail: err.message }
  } finally {
    busy.value = false
  }
}

function install() {
  const file = pending.value
  pending.value = null
  return run(async () => {
    try {
      const { plugin, previousVersion } = await installPluginFile(file)
      message.value = {
        kind: 'ok',
        text: previousVersion
          ? t('Updated {0} from {1} to {2}.', [plugin.name, previousVersion, plugin.version])
          : t('Installed {0} {1}. New lessons can use it.', [plugin.name, plugin.version]),
      }
    } catch (err) {
      message.value = { kind: 'error', text: t('This file is not a valid Thinkling extension.'), detail: err.message }
    }
  })
}

function toggle(folder: string, enabled: boolean) {
  message.value = null
  return run(() => setPluginEnabled(folder, enabled))
}

function remove(folder: string) {
  if (confirmRemove.value !== folder) {
    confirmRemove.value = folder
    return
  }
  confirmRemove.value = null
  message.value = null
  return run(() => removePlugin(folder))
}
</script>

<template>
  <AppShell>
    <div class="content">
      <h1>{{ t('Extensions') }}</h1>
      <p class="lead">{{ t('Extensions add interactive blocks to lessons, for example for maths or electronics. When an extension is on, the tutor can use it in new lessons.') }}</p>

      <section class="sec">
        <div
          class="card drop"
          :class="{ dragging }"
          @dragover.prevent="dragging = true"
          @dragleave="dragging = false"
          @drop.prevent="onDrop"
        >
          <Icon name="upload" :size="26" />
          <p>{{ t('Drop a .thinkling file here or') }}</p>
          <button type="button" class="btn btn-primary" :disabled="busy" @click="picker?.click()">{{ t('Choose a file') }}</button>
          <input ref="picker" type="file" accept=".thinkling,.zip" hidden @change="onPick" />
        </div>

        <div v-if="pending" class="card confirm" role="alertdialog" aria-labelledby="trust-title">
          <h2 id="trust-title">{{ t('Install {0}?', [pending.name]) }}</h2>
          <p>{{ t('An extension runs with the same access as Thinkling, including your files and the code sandbox. Install it only if you trust where it comes from.') }}</p>
          <div class="row">
            <button type="button" class="btn btn-primary" :disabled="busy" @click="install">{{ t('I trust it, install') }}</button>
            <button type="button" class="btn" @click="pending = null">{{ t('Cancel') }}</button>
          </div>
        </div>

        <div v-if="message" class="msg" :class="message.kind" role="status">
          <Icon :name="message.kind === 'ok' ? 'check' : 'x'" :size="18" />
          <div>
            <p>{{ message.text }}</p>
            <p v-if="message.detail" class="detail mono">{{ message.detail }}</p>
          </div>
        </div>
        <p v-if="pluginState.restartRecommended" class="msg warn" role="status">{{ t('Restart Thinkling to finish updating extensions.') }}</p>
      </section>

      <section class="sec">
        <h2>{{ t('Installed') }}</h2>
        <p v-if="!plugins.length" class="muted">{{ t('No extensions installed yet.') }}</p>
        <article v-for="plugin in plugins" :key="plugin.id" class="card plugin" :class="{ off: plugin.enabled === false }">
          <div class="head">
            <div>
              <h3>{{ plugin.name }}</h3>
              <span class="meta mono">{{ plugin.id }} · {{ plugin.version }}</span>
            </div>
            <label class="switch">
              <input
                type="checkbox"
                :checked="plugin.enabled !== false"
                :disabled="busy || !plugin.folder"
                @change="toggle(plugin.folder, ($event.target as HTMLInputElement).checked)"
              />
              <span>{{ t('Use in lessons') }}</span>
            </label>
          </div>
          <p class="summary">{{ plugin.summary }}</p>
          <div class="row">
            <button type="button" class="btn btn-sm btn-ghost-red" :disabled="busy || !plugin.folder" @click="remove(plugin.folder)">
              <Icon name="trash" :size="16" />{{ confirmRemove === plugin.folder ? t('Click again to remove') : t('Remove') }}
            </button>
          </div>
        </article>
      </section>

      <section v-if="pluginProblems.length" class="sec">
        <h2>{{ t('Extensions that could not be loaded') }}</h2>
        <article v-for="problem in pluginProblems" :key="problem.plugin" class="card plugin problem">
          <div class="head">
            <h3 class="mono">{{ problem.plugin }}</h3>
            <button
              v-if="problem.folder"
              type="button"
              class="btn btn-sm btn-ghost-red"
              :disabled="busy"
              @click="remove(problem.folder)"
            >
              <Icon name="trash" :size="16" />{{ confirmRemove === problem.folder ? t('Click again to remove') : t('Remove') }}
            </button>
          </div>
          <p class="detail mono">{{ problem.error }}</p>
        </article>
      </section>
    </div>
  </AppShell>
</template>

<style scoped>
.content {
  padding: 28px 32px 60px;
  max-width: 900px;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 28px;
}
h1 {
  font-size: 32px;
}
h2 {
  font-size: 20px;
}
h3 {
  font-size: 18px;
}
.lead {
  margin: -12px 0 0;
  color: var(--text-2);
  font-weight: 600;
  line-height: 1.5;
}
.sec {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.drop {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px;
  border-style: dashed;
  flex-wrap: wrap;
}
.drop p {
  margin: 0;
  font-weight: 700;
}
.drop.dragging {
  border-color: var(--purple);
  background: var(--purple-soft);
}
.confirm {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-color: var(--yellow);
}
.confirm p {
  margin: 0;
  line-height: 1.5;
  font-weight: 600;
}
.row {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
.msg {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin: 0;
  font-weight: 700;
}
.msg p {
  margin: 0;
}
.msg.ok {
  color: var(--green-light);
}
.msg.error {
  color: var(--red-light);
}
.msg.warn {
  color: var(--yellow-light);
}
.plugin {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.plugin.off {
  opacity: 0.65;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}
.meta {
  font-size: 12px;
  color: var(--muted);
}
.summary {
  margin: 0;
  color: var(--text-3);
  font-weight: 600;
  line-height: 1.5;
}
.switch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  cursor: pointer;
}
.switch input {
  width: 18px;
  height: 18px;
  accent-color: var(--purple);
}
.detail {
  margin: 0;
  font-size: 13px;
  color: var(--text-3);
  white-space: pre-wrap;
  word-break: break-word;
}
.mono {
  font-family: var(--mono);
}
.muted {
  color: var(--muted);
  margin: 0;
}
@media (max-width: 760px) {
  .content {
    padding: 20px 16px 40px;
  }
}
</style>
