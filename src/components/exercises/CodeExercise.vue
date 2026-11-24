<script setup>
import { computed, shallowRef, useTemplateRef, watch } from 'vue'
import BrowserCodeWorkspace from './BrowserCodeWorkspace.vue'
import CodeTaskBrief from './CodeTaskBrief.vue'
import SandboxIDE from '../SandboxIDE.vue'
import { RUNNABLE } from '../../lib/runner.js'
import { mergeFiles, wsIdFor } from '../../lib/sandbox.js'
import { useApp } from '../../stores/app.js'

const props = defineProps({
  exercise: { type: Object, required: true },
  result: { type: Object, default: null },
  busy: Boolean,
})
const solution = defineModel({ type: String, default: '' })
const issues = defineModel('issues', { type: Array, default: () => [] })
const emit = defineEmits(['submit'])
const app = useApp()

const LANGUAGES = {
  javascript: { label: 'JavaScript', ext: 'js' },
  typescript: { label: 'TypeScript', ext: 'ts' },
  python: { label: 'Python', ext: 'py' },
  go: { label: 'Go', ext: 'go' },
  rust: { label: 'Rust', ext: 'rs' },
  java: { label: 'Java', ext: 'java' },
  csharp: { label: 'C#', ext: 'cs' },
  cpp: { label: 'C++', ext: 'cpp' },
}

const language = computed(() => (props.exercise.codeLanguage || app.plan?.language || 'javascript').toLowerCase())
const languageLabel = computed(() => LANGUAGES[language.value]?.label || language.value)
const ext = computed(() => LANGUAGES[language.value]?.ext || 'txt')
const fileName = computed(() => props.exercise.fileName || `solution.${ext.value}`)
const providerName = computed(() => app.settings.provider === 'codex' ? 'Codex' : 'Claude')
const sandboxMode = computed(() => props.exercise.runtime === 'docker')
const seedFiles = computed(() => mergeFiles(props.exercise.files, props.exercise.testFiles))
const testPaths = computed(() => (props.exercise.testFiles || []).map((file) => file.path))
const mainFile = computed(() => props.exercise.fileName || props.exercise.files?.[0]?.path || '')
const review = computed(() => props.result?.data || null)

const lastRun = shallowRef(null)
const browser = useTemplateRef('browser')
const sandbox = useTemplateRef('sandbox')
watch(() => props.exercise.id, () => { lastRun.value = null })

defineExpose({
  get runnable() {
    return sandboxMode.value || RUNNABLE.includes(language.value)
  },
  runAll: () => sandboxMode.value ? sandbox.value?.runTests() : browser.value?.runAll(),
  getFiles: () => sandbox.value?.userFiles() ?? Promise.resolve([]),
  showReview: () => sandboxMode.value ? sandbox.value?.showReview() : browser.value?.showReview(),
})
</script>

<template>
  <div class="code-exercise">
    <div class="code-workspace">
      <CodeTaskBrief
        :exercise="exercise"
        :language="language"
        :file-name="fileName"
        :run="lastRun"
        :show-solution="!!result"
      />
      <SandboxIDE
        v-if="sandboxMode"
        ref="sandbox"
        v-model:issues="issues"
        :ws-id="wsIdFor(exercise.id)"
        :language="language"
        :seed-files="seedFiles"
        :test-command="exercise.testCommand"
        :test-paths="testPaths"
        :main-file="mainFile"
        :review="review"
        :busy="busy"
        :provider-name="providerName"
        @run="lastRun = $event"
      />
      <BrowserCodeWorkspace
        v-else
        ref="browser"
        v-model="solution"
        v-model:issues="issues"
        :exercise="exercise"
        :language="language"
        :language-label="languageLabel"
        :ext="ext"
        :file-name="fileName"
        :review="review"
        :busy="busy"
        :provider-name="providerName"
        @run="lastRun = $event"
        @submit="emit('submit')"
      />
    </div>
  </div>
</template>

<style scoped>
.code-exercise {
  container-type: inline-size;
}
.code-workspace {
  display: grid;
  grid-template-columns: minmax(235px, 1fr) minmax(0, 2.1fr);
  grid-template-rows: minmax(0, 1fr);
  gap: clamp(12px, 1.5vw, 24px);
  height: max(520px, calc(100dvh - 190px));
}
@container (max-width: 760px) {
  .code-workspace {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto max(520px, 70dvh);
    height: auto;
  }
}
</style>
