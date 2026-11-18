<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { sandbox } from '../lib/sandbox.js'
import { play } from '../lib/sfx.js'
import CodeEditor from './CodeEditor.vue'
import Terminal from './Terminal.vue'
import Markdown from './Markdown.vue'
import Icon from './Icon.vue'

const props = defineProps({
  wsId: { type: String, required: true },
  language: { type: String, required: true },
  seedFiles: { type: Array, default: () => [] }, // [{path, content}] — szablon (pliki + testy)
  testCommand: { type: String, default: '' },
  testPaths: { type: Array, default: () => [] },
  mainFile: { type: String, default: '' },
  issues: { type: Array, default: () => [] }, // [{file, line, ...}]
  review: { type: Object, default: null }, // { summary } albo null
  busy: Boolean,
  providerName: { type: String, default: 'Claude' },
  envLabel: { type: String, default: '' },
  runLabel: { type: String, default: 'Uruchom testy' },
})
const emit = defineEmits(['update:issues', 'ready'])

const phase = ref('opening') // opening | ready | error
const progress = ref('')
const error = ref('')
const tree = ref([])
const files = reactive({}) // path -> { content, mtime, dirty }
const tabs = ref([])
const active = ref('')
const panel = ref('terminal')
const running = ref(false)
const run = ref(null)
const cursor = ref({ line: 1, col: 1 })
const termRef = ref(null)
const env = ref(props.envLabel)
const saveTimers = {}
let pollTimer = null

const EXT_LANG = {
  php: 'php', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', h: 'cpp', c: 'c', py: 'python', js: 'javascript', mjs: 'javascript',
  ts: 'typescript', go: 'go', rs: 'rust', java: 'java', cs: 'csharp', rb: 'ruby', sql: 'sql', json: 'json', md: 'markdown',
  sh: 'shell', yml: 'yaml', yaml: 'yaml', html: 'html', css: 'css', xml: 'xml', toml: 'ini', mod: 'go',
}
const langOf = (p) => EXT_LANG[p.split('.').pop().toLowerCase()] || 'plaintext'
const isTest = (p) => props.testPaths.includes(p) || /^tests?\//.test(p)

const visibleTree = computed(() => {
  const collapsed = tree.value.filter((e) => e.dir && e.skipped).map((e) => e.path + '/')
  return tree.value
    .filter((e) => !collapsed.some((c) => e.path.startsWith(c)))
    .map((e) => ({ ...e, depth: e.path.split('/').length - 1, name: e.path.split('/').pop() }))
})
const passed = computed(() => run.value?.results?.filter((r) => r.ok).length || 0)
const total = computed(() => run.value?.results?.length || 0)
const activeIssues = computed(() =>
  props.issues
    .map((i, idx) => ({ ...i, idx }))
    .filter((i) => (i.file || props.mainFile) === active.value),
)

async function open(reset = false) {
  phase.value = 'opening'
  error.value = ''
  progress.value = 'Uruchamiam kontener…'
  try {
    const data = await sandbox.open(props.wsId, props.language, props.seedFiles, { reset, onProgress: (m) => (progress.value = m) })
    env.value = data.env
    tree.value = data.files
    if (reset) {
      for (const k of Object.keys(files)) delete files[k]
      tabs.value = []
    }
    phase.value = 'ready'
    const first = props.mainFile && tree.value.some((f) => f.path === props.mainFile) ? props.mainFile : tree.value.find((f) => !f.dir && !isTest(f.path))?.path
    if (first) await openFile(first)
    startPolling()
    emit('ready')
  } catch (err) {
    phase.value = 'error'
    error.value = err.message
  }
}

async function openFile(path) {
  if (!files[path]) {
    const r = await sandbox.read(props.wsId, path)
    files[path] = { content: r.content, mtime: r.mtime, dirty: false }
  }
  if (!tabs.value.includes(path)) tabs.value.push(path)
  active.value = path
}

function closeTab(path) {
  if (files[path]?.dirty) save(path)
  tabs.value = tabs.value.filter((t) => t !== path)
  if (active.value === path) active.value = tabs.value[tabs.value.length - 1] || ''
}

function onEdit(path, value) {
  const f = files[path]
  if (!f || f.content === value) return
  f.content = value
  f.dirty = true
  clearTimeout(saveTimers[path])
  saveTimers[path] = setTimeout(() => save(path), 500)
}

async function save(path) {
  clearTimeout(saveTimers[path])
  const f = files[path]
  if (!f?.dirty) return
  const content = f.content
  const r = await sandbox.write(props.wsId, path, content)
  if (files[path]?.content === content) {
    files[path].dirty = false
    files[path].mtime = r.mtime
  }
}

async function flush() {
  await Promise.all(Object.keys(files).map((p) => save(p)))
}

async function poll() {
  try {
    const list = await sandbox.files(props.wsId)
    tree.value = list
    for (const e of list) {
      const f = files[e.path]
      if (f && !f.dirty && e.mtime && Math.abs(e.mtime - f.mtime) > 1) {
        const r = await sandbox.read(props.wsId, e.path)
        Object.assign(files[e.path], { content: r.content, mtime: r.mtime })
      }
    }
  } catch {}
}

function startPolling() {
  clearInterval(pollTimer)
  pollTimer = setInterval(poll, 2500)
}

async function newFile() {
  const name = prompt('Ścieżka nowego pliku (np. src/Helper.php):')
  if (!name?.trim()) return
  await sandbox.write(props.wsId, name.trim(), '')
  await poll()
  openFile(name.trim())
}

async function runTests() {
  if (!props.testCommand) return null
  await flush()
  running.value = true
  panel.value = 'tests'
  try {
    run.value = await sandbox.run(props.wsId, props.testCommand, { parse: true })
  } catch (err) {
    run.value = { results: [], compileError: err.message, output: '' }
  } finally {
    running.value = false
  }
  poll()
  return run.value
}

async function runTestsClick() {
  const r = await runTests()
  if (!r || props.busy) return
  const ok = !r.compileError && r.results.length && r.results.every((x) => x.ok)
  ok ? play('sparkle') : play('pop', 0.6)
}

function runInTerminal() {
  panel.value = 'terminal'
  flush().then(() => setTimeout(() => termRef.value?.run(props.testCommand), 50))
}

async function reset() {
  if (!confirm('Przywrócić pliki szablonu? Twoje zmiany w tym zadaniu zostaną usunięte.')) return
  clearInterval(pollTimer)
  run.value = null
  await open(true) // terminal montuje się na nowo po zmianie fazy
}

/** Pliki ucznia do review: wszystko poza testami, rozsądny rozmiar. */
async function userFiles() {
  await flush()
  const list = tree.value.filter((e) => !e.dir && !isTest(e.path) && (e.size ?? 0) < 60_000)
  const out = []
  let budget = 120_000
  for (const e of list) {
    const content = files[e.path]?.content ?? (await sandbox.read(props.wsId, e.path)).content
    if (content.length > budget) break
    budget -= content.length
    out.push({ path: e.path, content })
  }
  return out
}

function removeIssue(idx) {
  emit('update:issues', props.issues.filter((_, i) => i !== idx))
}

// wysokość panelu terminala (przeciąganie górnej krawędzi), zapamiętana lokalnie
const panelH = ref(Number(safeGet('dl-panel-h')) || 260)
function safeGet(k) {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
function startDrag(e) {
  const startY = e.clientY
  const startH = panelH.value
  const max = Math.max(200, (e.target.closest('.ide')?.clientHeight || 700) - 160)
  const move = (ev) => (panelH.value = Math.min(max, Math.max(110, startH + (startY - ev.clientY))))
  const up = () => {
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', up)
    try {
      localStorage.setItem('dl-panel-h', String(panelH.value))
    } catch {}
  }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', up)
}

const ICON = (p) => {
  const ext = p.split('.').pop().toLowerCase()
  return { php: 'PHP', py: 'PY', js: 'JS', ts: 'TS', cpp: 'C++', hpp: 'H', h: 'H', c: 'C', go: 'GO', rs: 'RS', java: 'JV', cs: 'C#', rb: 'RB', md: 'MD', json: '{}', sh: '$', sql: 'SQL' }[ext] || '·'
}

onMounted(() => open(false))
onBeforeUnmount(() => {
  clearInterval(pollTimer)
  flush()
})

defineExpose({ runTests, userFiles, flush, showReview: () => (panel.value = 'review'), getRun: () => run.value })
</script>

<template>
  <section class="ide">
    <div v-if="phase !== 'ready'" class="overlay">
      <template v-if="phase === 'opening'">
        <span class="spinner" />
        <strong>Przygotowuję środowisko {{ env || language }}</strong>
        <code class="prog">{{ progress }}</code>
      </template>
      <template v-else>
        <strong style="color: var(--red-light)">Nie udało się uruchomić kontenera</strong>
        <code class="prog">{{ error }}</code>
        <button class="btn btn-sm btn-primary" @click="open(false)">Spróbuj ponownie</button>
      </template>
    </div>

    <div class="tabs" role="tablist">
      <button
        v-for="t in tabs"
        :key="t"
        role="tab"
        class="ftab"
        :class="{ on: t === active }"
        :aria-selected="t === active"
        @click="active = t"
        @auxclick.prevent="closeTab(t)"
      >
        <span class="ext">{{ ICON(t) }}</span>{{ t.split('/').pop() }}
        <span v-if="files[t]?.dirty" class="dirty" title="Niezapisane" />
        <span class="x" role="button" aria-label="Zamknij" @click.stop="closeTab(t)">×</span>
      </button>
    </div>

    <div class="body">
      <aside class="tree" aria-label="Pliki">
        <div class="tree-h">
          <span>EXPLORER</span>
          <button class="tb" title="Nowy plik" aria-label="Nowy plik" @click="newFile">+</button>
          <button class="tb" title="Odśwież" aria-label="Odśwież" @click="poll"><Icon name="refresh" :size="13" :stroke="2.6" /></button>
        </div>
        <button
          v-for="e in visibleTree"
          :key="e.path"
          class="node"
          :class="{ dir: e.dir, on: e.path === active, test: !e.dir && isTest(e.path) }"
          :style="{ paddingLeft: `${10 + e.depth * 12}px` }"
          :disabled="e.dir"
          :title="e.path"
          @click="!e.dir && openFile(e.path)"
        >
          <span class="ni">{{ e.dir ? '▾' : ICON(e.path) }}</span>
          <span class="nn">{{ e.name }}{{ e.dir && e.skipped ? '/…' : '' }}</span>
          <span v-if="!e.dir && isTest(e.path)" class="tt">test</span>
        </button>
      </aside>

      <div class="editor">
        <CodeEditor
          v-if="active && files[active]"
          :key="active"
          keep-model
          :model-value="files[active].content"
          :language="langOf(active)"
          :file-name="active"
          :uid="wsId"
          :issues="activeIssues"
          :read-only="busy"
          :provider-name="providerName"
          @update:model-value="onEdit(active, $event)"
          @cursor="cursor = $event"
          @save="save(active)"
          @apply="(i) => removeIssue(activeIssues[i]?.idx)"
          @dismiss="(i) => removeIssue(activeIssues[i]?.idx)"
        />
        <div v-else class="empty muted">Wybierz plik z drzewa po lewej.</div>
      </div>
    </div>

    <div class="panel" :style="{ height: `${panelH}px` }">
      <div class="drag" title="Przeciągnij, aby zmienić wysokość" @mousedown.prevent="startDrag" />
      <div class="ptabs" role="tablist">
        <button role="tab" :class="{ on: panel === 'terminal' }" @click="panel = 'terminal'">Terminal</button>
        <button role="tab" :class="{ on: panel === 'tests' }" @click="panel = 'tests'">{{ testPaths.length ? 'Testy' : 'Wynik' }} <template v-if="total">{{ passed }}/{{ total }}</template></button>
        <button v-if="review !== undefined && testPaths.length" role="tab" :class="{ on: panel === 'review' }" @click="panel = 'review'">Review {{ providerName }}</button>
        <span class="grow" />
        <button class="pbtn" title="Przywróć pliki szablonu" @click="reset"><Icon name="refresh" :size="14" :stroke="2.4" />Szablon</button>
        <button class="pbtn" :disabled="!testCommand" title="Wpisz komendę testów w terminalu" @click="runInTerminal">$ w terminalu</button>
        <button class="pbtn run" :disabled="running || !testCommand || phase !== 'ready'" @click="runTestsClick">
          <span v-if="running" class="spinner" style="width: 14px; height: 14px; border-width: 2px" />▶ {{ runLabel }}
        </button>
      </div>
      <div class="pbody">
        <Terminal v-if="phase === 'ready'" v-show="panel === 'terminal'" ref="termRef" :ws-id="wsId" :active="panel === 'terminal'" class="termbox" />
        <div v-if="panel === 'tests'" class="list">
          <code class="cmd">$ {{ testCommand }}</code>
          <span v-if="running" class="muted">Uruchamiam w kontenerze…</span>
          <span v-else-if="!run" class="muted">Kliknij „Uruchom testy” albo odpal je w terminalu.</span>
          <template v-else>
            <span v-for="(r, i) in run.results" :key="i" :class="r.ok ? 'good' : 'bad'">{{ r.ok ? '✓' : '✗' }} {{ r.name }}<template v-if="!r.ok"> — {{ r.error }}</template></span>
            <pre v-if="run.compileError || !run.results.length" class="raw">{{ run.compileError || run.output }}</pre>
            <details v-else class="rawd"><summary>Pełne wyjście</summary><pre class="raw">{{ run.output }}</pre></details>
          </template>
        </div>
        <div v-if="panel === 'review'" class="list">
          <span v-if="busy" class="muted">{{ providerName }} robi review…</span>
          <Markdown v-else-if="review?.summary" :src="review.summary" class="review" />
          <span v-else class="muted">Review pojawi się po „Sprawdź z {{ providerName }}”.</span>
        </div>
      </div>
    </div>

    <div class="status">
      <span>{{ env }} · {{ active || '—' }} · Ln {{ cursor.line }}, Col {{ cursor.col }}</span>
      <span>● Docker · bez sieci · /workspace</span>
    </div>
  </section>
</template>

<style scoped>
.ide {
  position: relative;
  flex: 999 1 560px;
  min-width: 0;
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
.tree {
  width: 200px;
  flex: none;
  border-right: 2px solid var(--divider);
  background: #111417;
  overflow-y: auto;
  padding-bottom: 8px;
}
.tree-h {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 10px 8px 8px 12px;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.08em;
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
  background: #1a1e22;
}
.node.on {
  background: var(--purple-soft);
  color: var(--purple-light);
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
  gap: 18px;
  justify-content: space-between;
  background: var(--purple-soft);
  padding: 5px 16px;
  font-family: var(--mono);
  font-size: 12px;
  color: var(--purple-light);
}
@media (max-width: 900px) {
  .tree {
    width: 140px;
  }
}
</style>
