<script setup lang="ts">
import { t } from '../../lib/i18n.ts'
import { computed, shallowRef } from 'vue'
import CodeEditor from '../CodeEditor.vue'
import Markdown from '../Markdown.vue'
import TestDiagnosis from './TestDiagnosis.vue'
import { allTestsPassed, RUNNABLE, runTests } from '../../lib/runner.ts'
import { play } from '../../lib/sfx.ts'
import { useApp } from '../../stores/app.ts'
import type { CodeIssue } from '../../domain.ts'
import { UiSpinner, UiTabs } from '../ui/index.ts'

const props = defineProps({
  exercise: { type: Object, required: true },
  language: { type: String, required: true },
  languageLabel: { type: String, required: true },
  fileName: { type: String, required: true },
  ext: { type: String, required: true },
  providerName: { type: String, required: true },
  review: { type: Object, default: null },
  busy: Boolean,
})
const solution = defineModel({ type: String, default: '' })
const issues = defineModel<CodeIssue[]>('issues', { default: () => [] })
const emit = defineEmits(['run', 'submit'])
const app = useApp()

const tab = shallowRef('file')
const panel = shallowRef('tests')
const fileTabs = computed(() => [
  { value: 'file', label: props.fileName },
  { value: 'tests', label: runnable.value ? testFile.value : t('test cases') },
])
const panelTabs = computed(() => [
  { value: 'tests', label: total.value ? `${t('Tests')} ${passed.value}/${total.value}` : t('Tests') },
  { value: 'console', label: run.value?.logs?.length ? `${t('Console')} (${run.value.logs.length})` : t('Console') },
  { value: 'review', label: `Review ${props.providerName}` },
])
const running = shallowRef(false)
const run = shallowRef(null)
const cursor = shallowRef({ line: 1, col: 1 })

const runnable = computed(() => RUNNABLE.includes(props.language))
const port = computed(() => app.status?.port || 3141)
const testFile = computed(() => props.fileName.replace(/\.(\w+)$/, '.test.js'))
const passed = computed(() => run.value?.results?.filter((result) => result.ok).length || 0)
const total = computed(() => run.value?.results?.length || 0)

async function runAll() {
  if (!runnable.value || running.value) return run.value
  running.value = true
  panel.value = 'tests'
  try {
    run.value = await runTests({ code: solution.value, tests: props.exercise.tests, language: props.language })
    emit('run', run.value)
    if (!props.busy) {
      if (allTestsPassed(run.value)) play('sparkle')
      else play('pop', 0.6)
    }
    return run.value
  } finally {
    running.value = false
  }
}

function onApply(index) {
  issues.value = issues.value.filter((_, i) => i !== index)
}

function showReview() {
  panel.value = 'review'
}

defineExpose({ runAll, showReview })
</script>

<template>
  <section class="ide" :aria-label="t('Code editor')">
    <UiTabs v-model="tab" variant="file" :tabs="fileTabs" :label="t('Files')">
      <template #tab="{ tab: item }">
        <span class="ext">{{ item.value === 'file' ? ext.toUpperCase() : runnable ? 'JS' : 'MD' }}</span>{{ item.label }}
      </template>
    </UiTabs>

    <div class="editor-area">
      <CodeEditor
        v-show="tab === 'file'"
        v-model="solution"
        :language="language"
        :file-name="fileName"
        :uid="exercise.id"
        :issues="issues"
        :read-only="busy"
        :provider-name="providerName"
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
      <UiTabs v-model="panel" class="ptabs" :tabs="panelTabs" :label="t('Results')">
        <template #end>
        <span
          v-if="exercise.testsStatus === 'verified'"
          class="tstat ok"
          :title="exercise.testsFixNote || t('The reference solution passes all tests and the starter code fails at least one.')"
        >{{ t('✓ tests verified') }}{{ exercise.testsFixNote ? t(' (repaired)') : '' }}</span>
        <span
          v-else-if="exercise.testsStatus === 'unverified'"
          class="tstat warn"
          :title="t('The reference solution still fails after repair. Grading relies on code review.')"
        >{{ t('⚠ unverified tests — grading relies on review') }}</span>
        <button v-if="runnable" class="run" :disabled="running" @click="runAll">
          <UiSpinner v-if="running" size="sm" />
          {{ t('▶ Run tests') }}
        </button>
        </template>
      </UiTabs>
      <div class="pbody">
        <template v-if="panel === 'tests'">
          <span v-if="!runnable" class="muted">{{ t('Tests in') }} {{ languageLabel }} {{ t('are checked by') }} {{ providerName }} {{ t('during review without running them.') }}</span>
          <span v-else-if="running" class="muted">{{ t('Running…') }}</span>
          <span v-else-if="!run" class="muted">{{ t('Click “Run tests” or go straight to “Check with') }} {{ providerName }}”.</span>
          <template v-else>
            <span v-if="run.compileError" class="bad">✗ {{ run.compileError }}</span>
            <TestDiagnosis :run="run" :code="solution" />
            <span v-for="(r, i) in run.results" :key="i" :class="r.ok ? 'good' : 'bad'">
              {{ r.ok ? '✓' : '✗' }} {{ r.name }}<template v-if="!r.ok"> — {{ r.error }}</template>
            </span>
            <span v-if="!run.compileError && !run.results.length" class="muted">{{ t('There are no tests to run.') }}</span>
          </template>
        </template>
        <template v-else-if="panel === 'console'">
          <span v-if="!run?.logs?.length" class="muted">{{ t('No logs. Add console.log to your code and run the tests.') }}</span>
          <span v-for="(l, i) in run?.logs || []" :key="i" :class="l.level === 'error' ? 'bad' : l.level === 'warn' ? 'warn' : ''">{{ l.text }}</span>
        </template>
        <template v-else>
          <span v-if="busy" class="muted">{{ providerName }} {{ t('is reviewing…') }}</span>
          <Markdown v-else-if="review?.summary" :src="review.summary" class="review" />
          <span v-else class="muted">{{ t('Review appears after you choose “Check with') }} {{ providerName }}”.</span>
        </template>
      </div>
    </div>
    <div class="status">
      <span>{{ languageLabel }} · Ln {{ cursor.line }}, Col {{ cursor.col }} · {{ runnable ? 'Web Worker' : t('review only') }}</span>
      <span>● {{ providerName }} · localhost:{{ port }}</span>
    </div>
  </section>
</template>

<style scoped>
.ide {
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-deep);
  border: 2px solid var(--border);
  border-bottom-width: 5px;
  border-radius: 18px;
  overflow: hidden;
}
.ext {
  color: #ffcb6b;
  font-weight: 700;
}
.editor-area {
  flex: 1;
  min-height: 280px;
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
  padding: 0 12px;
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
  background: var(--green-soft);
  border: 1px solid var(--green-border);
  border-radius: 8px;
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 900;
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
  gap: 4px 16px;
  justify-content: space-between;
  border-top: 1px solid var(--border);
  background: var(--surface-2);
  padding: 6px 16px;
  font-family: var(--mono);
  font-size: 12px;
  color: var(--text-3);
}
</style>
