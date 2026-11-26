<script setup lang="ts">
import { t } from '../../lib/i18n.ts'
import { computed, nextTick, shallowRef, useTemplateRef } from 'vue'
import { fileBadge } from '../../lib/sandbox-file-types.ts'
import Icon from '../Icon.vue'
import type { PropType } from 'vue'
import type { WorkspaceEntry } from '../../domain.ts'

const props = defineProps({
  entries: { type: Array as PropType<WorkspaceEntry[]>, required: true },
  active: { type: String, required: true },
  isTest: { type: Function, required: true },
  createFile: { type: Function as PropType<(path: string) => Promise<void>>, required: true },
})
const emit = defineEmits(['open', 'refresh'])
const naming = shallowRef(false)
const name = shallowRef('')
const creating = shallowRef(false)
const error = shallowRef('')
const nameInput = useTemplateRef('nameInput')
const createButton = useTemplateRef('createButton')

async function startCreate() {
  naming.value = true
  await nextTick()
  nameInput.value?.focus()
}

function cancelCreate() {
  if (creating.value) return
  naming.value = false
  name.value = ''
  error.value = ''
  createButton.value?.focus()
}

async function submitCreate() {
  if (creating.value || !name.value.trim()) return
  creating.value = true
  error.value = ''
  try {
    await props.createFile(name.value.trim())
    creating.value = false
    cancelCreate()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : t('Could not create the file')
    creating.value = false
    await nextTick()
    nameInput.value?.focus()
  }
}

const visibleFiles = computed(() => {
  const collapsed = props.entries.filter((entry) => entry.dir && entry.skipped).map((entry) => entry.path + '/')
  return props.entries
    .filter((entry) => !collapsed.some((dir) => entry.path.startsWith(dir)))
    .map((entry) => {
      const segments = entry.path.split('/')
      return { ...entry, name: segments.at(-1), depth: segments.length - 1, test: !entry.dir && props.isTest(entry.path) }
    })
})
</script>

<template>
  <aside class="tree" :aria-label="t('Files')">
    <div class="tree-h">
      <span>{{ t('Files') }}</span>
      <button ref="createButton" type="button" class="tb" :title="t('New file')" :aria-label="t('New file')" :disabled="creating" :aria-expanded="naming" @click="startCreate">+</button>
      <button type="button" class="tb" :title="t('Refresh')" :aria-label="t('Refresh')" @click="emit('refresh')"><Icon name="refresh" :size="13" :stroke="2.6" /></button>
    </div>
    <form v-if="naming" class="new-file" :aria-label="t('New file')" :aria-busy="creating" @submit.prevent="submitCreate" @keydown.esc.stop.prevent="cancelCreate">
      <label>
        {{ t('File path') }}
        <input ref="nameInput" v-model="name" type="text" :disabled="creating" :aria-invalid="!!error" autocomplete="off" spellcheck="false" @input="error = ''" />
      </label>
      <p v-if="error" role="alert">{{ error }}</p>
      <div class="new-file-actions">
        <button type="submit" :disabled="creating || !name.trim()">{{ t('Create file') }}</button>
        <button type="button" :disabled="creating" @click="cancelCreate">{{ t('Cancel') }}</button>
      </div>
    </form>
    <button
      v-for="entry in visibleFiles"
      :key="entry.path"
      type="button"
      class="node"
      :class="{ dir: entry.dir, on: entry.path === active }"
      :style="{ paddingLeft: `${10 + entry.depth * 12}px` }"
      :disabled="entry.dir"
      :aria-current="entry.path === active ? 'true' : undefined"
      :title="entry.path"
      @click="emit('open', entry.path)"
    >
      <span class="ni">{{ entry.dir ? '▾' : fileBadge(entry.path) }}</span>
      <span class="nn">{{ entry.name }}{{ entry.dir && entry.skipped ? '/…' : '' }}</span>
      <span v-if="entry.test" class="tt">test</span>
    </button>
  </aside>
</template>

<style scoped>
.tree {
  width: clamp(104px, 17vw, 176px);
  flex: none;
  border-right: 1px solid var(--border);
  background: var(--surface-2);
  overflow-y: auto;
  padding-bottom: 8px;
}
.tree-h {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 10px 8px 8px 12px;
  font-size: 13px;
  font-weight: 800;
  color: var(--muted);
}
.tree-h span {
  flex: 1;
}
.tb {
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 6px;
  background: none;
  color: var(--muted);
  cursor: pointer;
  font-size: 16px;
  font-weight: 700;
}
.tb:hover {
  background: var(--border);
  color: var(--text);
}
.new-file {
  padding: 4px 8px 12px;
  font-size: 12px;
  color: var(--text-3);
}
.new-file label {
  display: grid;
  gap: 6px;
}
.new-file input {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 7px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  font-family: var(--mono);
  font-size: 12px;
}
.new-file input:focus-visible {
  outline: 2px solid var(--purple);
  outline-offset: 1px;
}
.new-file p {
  color: var(--red);
  overflow-wrap: anywhere;
  margin: 6px 0;
}
.new-file-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 8px;
}
.new-file-actions button {
  padding: 5px 7px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  cursor: pointer;
}
.new-file-actions button[type='submit'] {
  background: var(--purple-soft);
  color: var(--purple-light);
}
.new-file-actions button:disabled {
  opacity: .5;
  cursor: default;
}
.node {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  padding-top: 4px;
  padding-bottom: 4px;
  padding-right: 8px;
  background: none;
  border: none;
  text-align: left;
  font-family: var(--mono);
  font-size: 12.5px;
  color: var(--text-3);
  cursor: pointer;
}
.node:hover:not(:disabled) {
  background: var(--surface);
}
.node.on {
  background: var(--purple-soft);
  color: var(--purple-light);
  box-shadow: inset 2px 0 var(--purple);
}
.node.dir {
  color: var(--muted);
  cursor: default;
}
.ni {
  width: 26px;
  flex: none;
  font-size: 10px;
  font-weight: 700;
  color: #ffcb6b;
  text-align: center;
}
.node.dir .ni {
  color: var(--muted);
}
.nn {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tt {
  font-size: 10px;
  font-family: var(--font);
  font-weight: 800;
  color: var(--green-light);
  background: var(--green-soft);
  border-radius: 5px;
  padding: 0 5px;
}
</style>
