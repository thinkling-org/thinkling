<script setup>
import { computed, ref } from 'vue'
import Markdown from '../Markdown.vue'
import CodeBlock from '../CodeBlock.vue'
import CodeEditor from '../CodeEditor.vue'
import SandboxIDE from '../SandboxIDE.vue'
import { RUNNABLE, runTests } from '../../lib/runner.js'
import { wsIdFor, mergeFiles } from '../../lib/sandbox.js'
import { play } from '../../lib/sfx.js'
import { useApp } from '../../stores/app.js'

const props = defineProps({
  exercise: { type: Object, required: true },
  modelValue: { type: String, default: '' },
  result: { type: Object, default: null },
  issues: { type: Array, default: () => [] },
  busy: Boolean,
})
const emit = defineEmits(['update:modelValue', 'update:issues', 'submit'])
const app = useApp()

const lang = computed(() => (props.exercise.codeLanguage || app.plan?.language || 'javascript').toLowerCase())
const runnable = computed(() => RUNNABLE.includes(lang.value))
const LANG_LABEL = { javascript: 'JavaScript', typescript: 'TypeScript', python: 'Python', go: 'Go', rust: 'Rust', java: 'Java', csharp: 'C#', cpp: 'C++' }
const ext = computed(() => ({ javascript: 'js', typescript: 'ts', python: 'py', go: 'go', rust: 'rs', java: 'java', csharp: 'cs', cpp: 'cpp' })[lang.value] || 'txt')
const fileName = computed(() => props.exercise.fileName || `solution.${ext.value}`)
const testFile = computed(() => fileName.value.replace(/\.(\w+)$/, '.test.js'))
const providerName = computed(() => (app.settings.provider === 'codex' ? 'Codex' : 'Claude'))

const tab = ref('file') // file | tests
const panel = ref('tests') // tests | console | review
const running = ref(false)
const run = ref(null)
const cursor = ref({ line: 1, col: 1 })

const passed = computed(() => run.value?.results?.filter((r) => r.ok).length || 0)
const total = computed(() => run.value?.results?.length || 0)

// tryb "docker": prawdziwy projekt w kontenerze z terminalem
const sandboxMode = computed(() => props.exercise.runtime === 'docker')
const ideRef = ref(null)
const seedFiles = computed(() => mergeFiles(props.exercise.files, props.exercise.testFiles))
const testPaths = computed(() => (props.exercise.testFiles || []).map((f) => f.path))
const mainFile = computed(() => props.exercise.fileName || props.exercise.files?.[0]?.path || '')

async function runAll() {
  if (sandboxMode.value) return ideRef.value?.runTests()
  if (!runnable.value || running.value) return run.value
  running.value = true
  panel.value = 'tests'
  try {
    run.value = await runTests({ code: props.modelValue, tests: props.exercise.tests, language: lang.value })
    const ok = !run.value.compileError && run.value.results.length && run.value.results.every((r) => r.ok)
    if (!props.busy) ok ? play('sparkle') : play('pop', 0.6)
  } finally {
    running.value = false
  }
  return run.value
}

function onApply(idx) {
  emit('update:issues', props.issues.filter((_, i) => i !== idx))
}

defineExpose({
  runAll,
  get runnable() {
    return sandboxMode.value || runnable.value
  },
  sandbox: sandboxMode,
  getFiles: () => ideRef.value?.userFiles() ?? Promise.resolve([]),
  getRun: () => (sandboxMode.value ? ideRef.value?.getRun() : run.value),
  showReview: () => (sandboxMode.value ? ideRef.value?.showReview() : (panel.value = 'review')),
})
</script>

<template>
  <div class="cx">
    <section class="task">
      <span class="label" style="color: var(--purple-link)">Zadanie w edytorze</span>
      <Markdown tag="h1" class="title" :src="exercise.title || 'Zadanie'" inline />
      <Markdown class="desc" :src="exercise.prompt" />
      <div v-if="exercise.requirements?.length" class="card box">
        <span class="label">Wymagania</span>
        <ul>
          <li v-for="(r, i) in exercise.requirements" :key="i"><Markdown inline tag="span" :src="r" /></li>
        </ul>
      </div>
      <div v-if="exercise.example" class="card box">
        <span class="label">Przykład</span>
        <Markdown :src="exercise.example.includes('```') ? exercise.example : '```' + lang + '\n' + exercise.example + '\n```'" class="ex-md" />
      </div>
      <details v-if="result && exercise.solution" class="card box sol">
        <summary class="label">Wzorcowe rozwiązanie</summary>
        <CodeBlock :code="exercise.solution" :language="lang" :file-name="fileName" />
      </details>
      <details v-if="result && exercise.solutionFiles?.length" class="card box sol">
        <summary class="label">Wzorcowe rozwiązanie</summary>
        <CodeBlock v-for="f in exercise.solutionFiles" :key="f.path" :code="f.content" :language="lang" :file-name="f.path" />
      </details>
      <div v-if="sandboxMode" class="card box hint">
        <span class="label">Środowisko</span>
        <span>Prawdziwy kontener (bez sieci). Edytuj pliki, odpalaj komendy w terminalu. Testy:</span>
        <code>{{ exercise.testCommand }}</code>
      </div>
    </section>

    <SandboxIDE
      v-if="sandboxMode"
      ref="ideRef"
      :ws-id="wsIdFor(exercise.id)"
      :language="lang"
      :seed-files="seedFiles"
      :test-command="exercise.testCommand"
      :test-paths="testPaths"
      :main-file="mainFile"
      :issues="issues"
      :review="result?.data || null"
      :busy="busy"
      :provider-name="providerName"
      @update:issues="emit('update:issues', $event)"
    />

    <section v-else class="ide">
      <div class="tabs" role="tablist">
        <button role="tab" :aria-selected="tab === 'file'" class="ftab" :class="{ on: tab === 'file' }" @click="tab = 'file'">
          <span class="ext">{{ ext.toUpperCase() }}</span>{{ fileName }}
        </button>
        <button role="tab" :aria-selected="tab === 'tests'" class="ftab" :class="{ on: tab === 'tests' }" @click="tab = 'tests'">
          <span class="ext">{{ runnable ? 'JS' : 'MD' }}</span>{{ runnable ? testFile : 'przypadki testowe' }}
        </button>
      </div>

      <div class="editor-area">
        <CodeEditor
          v-show="tab === 'file'"
          :model-value="modelValue"
          :language="lang"
          :file-name="fileName"
          :uid="exercise.id"
          :issues="issues"
          :read-only="busy"
          :provider-name="providerName"
          @update:model-value="emit('update:modelValue', $event)"
          @cursor="cursor = $event"
          @apply="onApply"
          @dismiss="onApply"
          @submit="emit('submit')"
        />
        <div v-if="tab === 'tests'" class="tests-view">
          <pre v-if="runnable" class="hljs"><code>{{ exercise.tests }}</code></pre>
          <Markdown v-else :src="exercise.tests" />
        </div>
      </div>

      <div class="panel">
        <div class="ptabs" role="tablist">
          <button role="tab" :aria-selected="panel === 'tests'" :class="{ on: panel === 'tests' }" @click="panel = 'tests'">
            Testy <template v-if="total">{{ passed }}/{{ total }}</template>
          </button>
          <button role="tab" :aria-selected="panel === 'console'" :class="{ on: panel === 'console' }" @click="panel = 'console'">
            Konsola <template v-if="run?.logs?.length">({{ run.logs.length }})</template>
          </button>
          <button role="tab" :aria-selected="panel === 'review'" :class="{ on: panel === 'review' }" @click="panel = 'review'">
            Review {{ providerName }}
          </button>
          <span
            v-if="exercise.testsStatus === 'verified'"
            class="tstat ok"
            :title="exercise.testsFixNote || 'Wzorcowe rozwiązanie przechodzi wszystkie testy, a szablon je oblewa.'"
          >✓ testy zweryfikowane{{ exercise.testsFixNote ? ' (poprawione)' : '' }}</span>
          <span
            v-else-if="exercise.testsStatus === 'unverified'"
            class="tstat warn"
            title="Wzorcowe rozwiązanie nie przeszło testów nawet po poprawce. O zaliczeniu decyduje review."
          >⚠ testy niepewne — decyduje review</span>
          <button v-if="runnable" class="run" :disabled="running" @click="runAll">
            <span v-if="running" class="spinner" style="width: 14px; height: 14px; border-width: 2px" />
            ▶ Uruchom testy
          </button>
        </div>
        <div class="pbody">
          <template v-if="panel === 'tests'">
            <span v-if="!runnable" class="muted">Testy w {{ LANG_LABEL[lang] || lang }} sprawdza {{ providerName }} podczas review (bez uruchamiania).</span>
            <span v-else-if="running" class="muted">Uruchamiam…</span>
            <span v-else-if="!run" class="muted">Kliknij „Uruchom testy” albo od razu „Sprawdź z {{ providerName }}”.</span>
            <template v-else>
              <span v-if="run.compileError" class="bad">✗ {{ run.compileError }}</span>
              <span v-for="(r, i) in run.results" :key="i" :class="r.ok ? 'good' : 'bad'">
                {{ r.ok ? '✓' : '✗' }} {{ r.name }}<template v-if="!r.ok"> — {{ r.error }}</template>
              </span>
              <span v-if="!run.compileError && !run.results.length" class="muted">Brak testów do uruchomienia.</span>
            </template>
          </template>
          <template v-else-if="panel === 'console'">
            <span v-if="!run?.logs?.length" class="muted">Brak logów. Użyj console.log w kodzie i uruchom testy.</span>
            <span v-for="(l, i) in run?.logs || []" :key="i" :class="l.level === 'error' ? 'bad' : l.level === 'warn' ? 'warn' : ''">{{ l.text }}</span>
          </template>
          <template v-else>
            <span v-if="busy" class="muted">{{ providerName }} robi review…</span>
            <Markdown v-else-if="result?.data?.summary" :src="result.data.summary" class="review" />
            <span v-else class="muted">Review pojawi się po „Sprawdź z {{ providerName }}”.</span>
          </template>
        </div>
      </div>
      <div class="status">
        <span>{{ LANG_LABEL[lang] || lang }} · Ln {{ cursor.line }}, Col {{ cursor.col }} · {{ runnable ? 'Web Worker' : 'review only' }}</span>
        <span>● {{ providerName }} · localhost:{{ app.status?.port || 3141 }}</span>
      </div>
    </section>
  </div>
</template>

<style scoped>
.cx {
  display: flex;
  gap: 20px;
  height: calc(100vh - 190px);
  min-height: 520px;
}
.task {
  flex: 0 1 400px;
  min-width: 300px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  padding-right: 6px;
}
.title {
  font-size: 28px;
  line-height: 1.2;
  font-weight: 900;
}
.title :deep(code) {
  font-size: 0.8em;
}
.desc {
  font-size: 16px;
  color: #c3c9ce;
}
.box {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-radius: 16px;
}
.box ul {
  margin: 0;
  padding-left: 1.1em;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-weight: 700;
  color: var(--text-2);
}
.ex-md :deep(pre) {
  margin: 0;
  font-size: 13px;
}
.sol summary {
  cursor: pointer;
}
.sol[open] {
  gap: 12px;
}
.hint {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-3);
}
.hint code {
  font-size: 12px;
  color: var(--green-light);
  background: var(--bg-deep);
  border-radius: 8px;
  padding: 6px 8px;
  overflow-wrap: anywhere;
}
.ide {
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
.tabs {
  display: flex;
  background: var(--bg);
  border-bottom: 2px solid var(--divider);
  overflow-x: auto;
}
.ftab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 18px;
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
}
.editor-area {
  flex: 1;
  min-height: 320px;
  position: relative;
}
.tests-view {
  position: absolute;
  inset: 0;
  overflow: auto;
  padding: 16px 20px;
}
.tests-view pre {
  margin: 0;
  font-size: 14px;
  line-height: 1.7;
  white-space: pre-wrap;
}
.panel {
  border-top: 2px solid var(--divider);
  background: #13161a;
}
.ptabs {
  display: flex;
  gap: 4px;
  padding: 0 12px;
  border-bottom: 2px solid var(--divider);
  align-items: center;
  flex-wrap: wrap;
}
.ptabs button:not(.run) {
  padding: 10px 12px;
  font-size: 13px;
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
.ptabs button.on {
  color: var(--text);
  border-bottom-color: var(--purple);
}
.tstat {
  margin-left: auto;
  font-size: 12px;
  font-weight: 800;
  padding: 3px 8px;
  border-radius: 8px;
  cursor: help;
}
.tstat.ok {
  color: var(--green-light);
  background: var(--green-soft);
}
.tstat.warn {
  color: var(--yellow-light);
  background: var(--yellow-soft);
}
.tstat + .run {
  margin-left: 8px;
}
.run {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--surface);
  border: 2px solid var(--border);
  border-radius: 10px;
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--green-light);
  cursor: pointer;
}
.run:disabled {
  opacity: 0.6;
}
.pbody {
  padding: 12px 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-family: var(--mono);
  font-size: 13px;
  max-height: 180px;
  min-height: 70px;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.good {
  color: var(--green-light);
}
.bad {
  color: var(--red-light);
}
.warn {
  color: var(--yellow-light);
}
.review {
  font-family: var(--font);
  font-size: 15px;
  color: var(--text-2);
  white-space: normal;
}
.status {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  justify-content: space-between;
  background: var(--purple-soft);
  padding: 6px 16px;
  font-family: var(--mono);
  font-size: 12px;
  color: var(--purple-light);
}
@media (max-width: 900px) {
  .cx {
    flex-direction: column;
    height: auto;
  }
  .task {
    flex: none;
    min-width: 0;
    overflow: visible;
  }
  .ide {
    flex: none;
    height: 80vh;
  }
}
</style>
