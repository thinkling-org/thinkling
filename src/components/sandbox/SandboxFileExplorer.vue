<script setup lang="ts">
import { t } from '../../lib/i18n.ts'
import { computed } from 'vue'
import { fileBadge } from '../../lib/sandbox-file-types.ts'
import Icon from '../Icon.vue'
import type { PropType } from 'vue'
import type { WorkspaceEntry } from '../../domain.ts'

const props = defineProps({
  entries: { type: Array as PropType<WorkspaceEntry[]>, required: true },
  active: { type: String, required: true },
  isTest: { type: Function, required: true },
})
const emit = defineEmits(['open', 'create', 'refresh'])

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
      <button type="button" class="tb" :title="t('New file')" :aria-label="t('New file')" @click="emit('create')">+</button>
      <button type="button" class="tb" :title="t('Refresh')" :aria-label="t('Refresh')" @click="emit('refresh')"><Icon name="refresh" :size="13" :stroke="2.6" /></button>
    </div>
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
