<script setup lang="ts">
import { t } from '../lib/i18n.ts'
import { computed, onBeforeUnmount, shallowRef, useTemplateRef } from 'vue'
import { sandbox } from '../lib/sandbox.ts'
import { fileBadge, fileLanguage } from '../lib/sandbox-file-types.ts'
import { useSandboxWorkspace } from '../composables/useSandboxWorkspace.ts'
import { allTestsPassed } from '../lib/runner.ts'
import { play } from '../lib/sfx.ts'
import CodeEditor from './CodeEditor.vue'
import Terminal from './Terminal.vue'
import Markdown from './Markdown.vue'
import Icon from './Icon.vue'
import TestDiagnosis from './exercises/TestDiagnosis.vue'
import SandboxFileExplorer from './sandbox/SandboxFileExplorer.vue'
import type { PropType } from 'vue'
import type { CodeIssue, TestRun, WorkspaceFile } from '../domain.ts'

const props = defineProps({
  wsId: { type: String, required: true },
  language: { type: String, required: true },
  seedFiles: { type: Array as PropType<WorkspaceFile[]>, default: () => [] }, // Starter files and tests, each with path and content.
  testCommand: { type: String, default: '' },
  testPaths: { type: Array as PropType<string[]>, default: () => [] },
  mainFile: { type: String, default: '' },
  issues: { type: Array as PropType<CodeIssue[]>, default: () => [] }, // [{file, line, ...}]
  review: { type: Object, default: null }, // { summary } albo null
  busy: Boolean,
  providerName: { type: String, default: 'Claude' },
  envLabel: { type: String, default: '' },
  runLabel: { type: String, default: '' },
})
const emit = defineEmits(['update:issues', 'run'])

const {
  phase, progress, error, saveError, environment, tree, tabs, active, files, activeFile,
  isTest, open, openFile, closeTab, edit, save, flush, refresh, createFile, userFiles,
} = useSandboxWorkspace(props)

const panel = shallowRef('terminal')
const running = shallowRef(false)
const run = shallowRef<TestRun | null>(null)
const cursor = shallowRef({ line: 1, col: 1 })
const terminal = useTemplateRef('terminal')

const diagnosisCode = computed(() => {
  const path = active.value && !isTest(active.value) ? active.value : props.mainFile
  return files[path]?.content || ''
})
const passed = computed(() => run.value?.results?.filter((r) => r.ok).length || 0)
const total = computed(() => run.value?.results?.length || 0)
const activeIssues = computed(() =>
  props.issues
    .map((i, idx) => ({ ...i, idx }))
    .filter((i) => (i.file || props.mainFile) === active.value),
)

async function newFile() {
  const name = prompt(t('Path for the new file (e.g. src/Helper.php):'))?.trim()
  if (name) await createFile(name)
}

async function runTests() {
  if (!props.testCommand) return null
  if (running.value || phase.value !== 'ready') return run.value
  running.value = true
  panel.value = 'tests'
  try {
    await flush()
    run.value = await sandbox.run(props.wsId, props.testCommand, { parse: true })
  } catch (err) {
    run.value = { results: [], compileError: err.message, output: '' }
  } finally {
    running.value = false
  }
  emit('run', run.value)
  refresh()
  return run.value
}

async function runTestsClick() {
  const r = await runTests()
  if (!r || props.busy) return
  allTestsPassed(r) ? play('sparkle') : play('pop', 0.6)
}

function runInTerminal() {
  panel.value = 'terminal'
  flush().then(() => setTimeout(() => terminal.value?.run(props.testCommand), 50))
}

async function reset() {
  if (!confirm(t('Restore the starter files? This discards your changes to this exercise.'))) return
  run.value = null
  await open(true)
}

function removeIssue(idx) {
  emit('update:issues', props.issues.filter((_, i) => i !== idx))
}

// Store the resizable terminal panel height locally.
const panelH = shallowRef(Number(safeGet('dl-panel-h')) || 260)
function safeGet(k) {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
let endDrag
function startDrag(e) {
  endDrag?.()
  const startY = e.clientY
  const startH = panelH.value
  const max = Math.max(200, (e.target.closest('.ide')?.clientHeight || 700) - 160)
  const move = (ev) => (panelH.value = Math.min(max, Math.max(110, startH + (startY - ev.clientY))))
  endDrag = () => {
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', endDrag)
    endDrag = undefined
    try {
      localStorage.setItem('dl-panel-h', String(panelH.value))
    } catch {}
  }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', endDrag)
}

onBeforeUnmount(() => endDrag?.())

defineExpose({ runTests, userFiles, showReview: () => (panel.value = 'review') })
</script>

<template>
  <section class="ide">
    <div v-if="phase !== 'ready'" class="overlay">
      <template v-if="phase === 'opening'">
        <span class="spinner" />
        <strong>{{ t('Preparing the environment') }} {{ environment || language }}</strong>
        <code class="prog">{{ progress }}</code>
      </template>
      <template v-else>
        <strong style="color: var(--red-light)">{{ t('Couldn\'t start the container') }}</strong>
        <code class="prog">{{ error }}</code>
        <button class="btn btn-sm btn-primary" @click="open(false)">{{ t('Try again') }}</button>
      </template>
    </div>

    <div class="tabs" role="tablist">
      <button
        v-for="tabPath in tabs"
        :key="tabPath"
        role="tab"
        class="ftab"
        :class="{ on: tabPath === active }"
        :aria-selected="tabPath === active"
        @click="active = tabPath"
        @auxclick.prevent="closeTab(tabPath)"
      >
        <span class="ext">{{ fileBadge(tabPath) }}</span>{{ tabPath.split('/').pop() }}
        <span v-if="files[tabPath]?.dirty" class="dirty" :title="t('Unsaved')" />
        <span class="x" role="button" :aria-label="t('Close')" @click.stop="closeTab(tabPath)">×</span>
      </button>
    </div>

    <div class="body">
      <SandboxFileExplorer
        :entries="tree"
        :active="active"
        :is-test="isTest"
        @open="openFile"
        @create="newFile"
        @refresh="refresh"
      />

      <div class="editor">
        <CodeEditor
          v-if="activeFile"
          :key="active"
          keep-model
          :model-value="activeFile.content"
          :language="fileLanguage(active)"
          :file-name="active"
          :uid="wsId"
          :issues="activeIssues"
          :read-only="busy"
          :provider-name="providerName"
          @update:model-value="edit(active, $event)"
          @cursor="cursor = $event"
          @save="save(active)"
          @apply="(i) => removeIssue(activeIssues[i]?.idx)"
          @dismiss="(i) => removeIssue(activeIssues[i]?.idx)"
        />
        <div v-else class="empty muted">{{ t('Select a file from the tree on the left.') }}</div>
      </div>
    </div>

    <div class="panel" :style="{ height: `${panelH}px` }">
      <div class="drag" :title="t('Drag to resize')" @mousedown.prevent="startDrag" />
      <div class="ptabs" role="tablist">
        <button role="tab" :class="{ on: panel === 'terminal' }" @click="panel = 'terminal'">Terminal</button>
        <button role="tab" :class="{ on: panel === 'tests' }" @click="panel = 'tests'">{{ testPaths.length ? t('Tests') : t('Output') }} <template v-if="total">{{ passed }}/{{ total }}</template></button>
        <button v-if="review !== undefined && testPaths.length" role="tab" :class="{ on: panel === 'review' }" @click="panel = 'review'">Review {{ providerName }}</button>
        <span class="grow" />
        <button class="pbtn" :title="t('Restore starter files')" @click="reset"><Icon name="refresh" :size="14" :stroke="2.4" />{{ t('Starter files') }}</button>
        <button class="pbtn" :disabled="!testCommand" :title="t('Enter the test command in the terminal')" @click="runInTerminal">{{ t('$ in terminal') }}</button>
        <button class="pbtn run" :disabled="running || !testCommand || phase !== 'ready'" @click="runTestsClick">
          <span v-if="running" class="spinner" style="width: 14px; height: 14px; border-width: 2px" />▶ {{ runLabel || t('Run tests') }}
        </button>
      </div>
      <div class="pbody">
        <Terminal v-if="phase === 'ready'" v-show="panel === 'terminal'" ref="terminal" :ws-id="wsId" :active="panel === 'terminal'" class="termbox" />
        <div v-if="panel === 'tests'" class="list">
          <code class="cmd">$ {{ testCommand }}</code>
          <span v-if="running" class="muted">{{ t('Running in the container…') }}</span>
          <span v-else-if="!run" class="muted">{{ t('Click “Run tests” or run them in the terminal.') }}</span>
          <template v-else>
            <TestDiagnosis :run="run" :code="diagnosisCode" />
            <span v-for="(r, i) in run.results" :key="i" :class="r.ok ? 'good' : 'bad'">{{ r.ok ? '✓' : '✗' }} {{ r.name }}<template v-if="!r.ok"> — {{ r.error }}</template></span>
            <pre v-if="run.compileError || !run.results.length" class="raw">{{ run.compileError || run.output }}</pre>
            <details v-else class="rawd"><summary>{{ t('Full output') }}</summary><pre class="raw">{{ run.output }}</pre></details>
          </template>
        </div>
        <div v-if="panel === 'review'" class="list">
          <span v-if="busy" class="muted">{{ providerName }} {{ t('is reviewing…') }}</span>
          <Markdown v-else-if="review?.summary" :src="review.summary" class="review" />
          <span v-else class="muted">{{ t('Review appears after you choose “Check with') }} {{ providerName }}”.</span>
        </div>
      </div>
    </div>

    <div v-if="saveError" class="save-error" role="alert">{{ t('Couldn\'t save the file.') }} {{ saveError }}</div>
    <div class="status">
      <span>{{ environment }} · {{ active || '—' }} · Ln {{ cursor.line }}, Col {{ cursor.col }}</span>
      <span>{{ t('● Docker · no network · /workspace') }}</span>
    </div>
  </section>
</template>

<style scoped>
.ide {
  position: relative;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-deep);
  border: 2px solid var(--border);
  border-bottom-width: 5px;
  border-radius: 18px;
  overflow: hidden;
}
.overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  background: rgba(15, 18, 20, 0.94);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px;
  text-align: center;
}
.prog {
  font-size: 12px;
  color: var(--muted);
  max-width: 80%;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.tabs {
  display: flex;
  background: var(--bg);
  border-bottom: 2px solid var(--divider);
  overflow-x: auto;
  min-height: 44px;
}
.ftab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px 10px 16px;
  background: none;
  border: none;
  border-top: 2px solid transparent;
  font-family: var(--mono);
  font-size: 13px;
  color: var(--muted);
  cursor: pointer;
  white-space: nowrap;
}
.ftab.on {
  background: var(--bg-deep);
  border-top-color: var(--purple);
  color: var(--text);
}
.ext {
  color: #ffcb6b;
  font-weight: 700;
  font-size: 11px;
}
.dirty {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-3);
}
.x {
  opacity: 0;
  padding: 0 4px;
  border-radius: 4px;
}
.ftab:hover .x,
.ftab.on .x {
  opacity: 0.7;
}
.x:hover {
  background: var(--border);
  opacity: 1;
}
.body {
  flex: 1;
  min-height: 0;
  display: flex;
}
.editor {
  flex: 1;
  min-width: 0;
  position: relative;
}
.editor :deep(.ce) {
  position: absolute;
  inset: 0;
  min-height: 0;
}
.empty {
  padding: 24px;
  font-weight: 700;
}
.panel {
  position: relative;
  flex: none;
  display: flex;
  flex-direction: column;
  border-top: 2px solid var(--divider);
  background: #0b0d0f;
}
.drag {
  position: absolute;
  top: -5px;
  left: 0;
  right: 0;
  height: 8px;
  cursor: row-resize;
  z-index: 5;
}
.drag:hover {
  background: linear-gradient(transparent 3px, var(--purple) 3px, var(--purple) 5px, transparent 5px);
}
.ptabs {
  display: flex;
  gap: 4px;
  padding: 0 10px;
  border-bottom: 2px solid var(--divider);
  align-items: center;
  background: #13161a;
  flex-wrap: wrap;
}
.ptabs > button:not(.pbtn) {
  padding: 9px 10px;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  cursor: pointer;
}
.ptabs > button.on {
  color: var(--text);
  border-bottom-color: var(--purple);
}
.grow {
  flex: 1;
}
.pbtn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--surface);
  border: 2px solid var(--border);
  border-radius: 9px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 800;
  color: var(--text-3);
  cursor: pointer;
  font-family: var(--mono);
}
.pbtn.run {
  color: var(--green-light);
  font-family: var(--font);
  font-weight: 900;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.pbtn:disabled {
  opacity: 0.5;
}
.pbody {
  flex: 1;
  min-height: 0;
  position: relative;
}
.termbox {
  position: absolute;
  inset: 0;
}
.list {
  position: absolute;
  inset: 0;
  overflow: auto;
  padding: 10px 16px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-family: var(--mono);
  font-size: 13px;
}
.cmd {
  color: var(--muted);
  font-size: 12px;
}
.good {
  color: var(--green-light);
}
.bad {
  color: var(--red-light);
}
.raw {
  margin: 4px 0 0;
  color: var(--text-3);
  font-size: 12px;
  white-space: pre-wrap;
}
.rawd summary {
  cursor: pointer;
  color: var(--muted);
  font-size: 12px;
}
.review {
  font-family: var(--font);
  font-size: 15px;
  color: var(--text-2);
}
.status {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  justify-content: space-between;
  border-top: 1px solid var(--border);
  background: var(--surface-2);
  padding: 5px 16px;
  font-family: var(--mono);
  font-size: 12px;
  color: var(--text-3);
}
.save-error {
  padding: 6px 16px;
  color: var(--red-light);
  overflow-wrap: anywhere;
}
</style>
