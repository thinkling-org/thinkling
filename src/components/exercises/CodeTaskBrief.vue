<script setup lang="ts">
import { t } from '../../lib/i18n.ts'
import { computed, shallowRef, watch } from 'vue'
import CodeBlock from '../CodeBlock.vue'
import Markdown from '../Markdown.vue'
import ExerciseSupport from './ExerciseSupport.vue'
import { useLessonSupport } from '../../composables/useLessonSupport.ts'
import { allTestsPassed } from '../../lib/runner.ts'
import type { PropType } from 'vue'
import type { Exercise, TestRun } from '../../domain.ts'
import { UiChip } from '../ui/index.ts'

const props = defineProps({
  exercise: { type: Object as PropType<Exercise>, required: true },
  language: { type: String, required: true },
  fileName: { type: String, required: true },
  run: { type: Object as PropType<TestRun>, default: null },
  showSolution: Boolean,
  busy: Boolean,
})
const support = useLessonSupport()

const tools = computed(() => (props.exercise.toolbox || []).filter((tool) => tool?.name?.trim()))

const openTool = shallowRef(null)
const activeTool = computed(() => tools.value.find((tool) => tool.name === openTool.value) || null)
watch(() => props.exercise.id, () => { openTool.value = null })

function toggleTool(name) {
  support?.mark(props.exercise.id, 'syntax')
  openTool.value = openTool.value === name ? null : name
}

const reqState = computed(() => {
  const r = props.run
  if (!r || (!r.compileError && !r.results?.length)) return 'todo'
  return allTestsPassed(r) ? 'ok' : 'bad'
})
const scoreLabel = computed(() => {
  const n = props.exercise.requirements?.length || 0
  const r = props.run
  if (reqState.value === 'ok') return t('{0} / {1} met', [n, n])
  if (reqState.value === 'bad') {
    const ok = r.results?.filter((x) => x.ok).length || 0
    return t('tests {0} / {1}', [ok, r.results?.length || 0])
  }
  return `0 / ${n}`
})
const failNote = computed(() => {
  const r = props.run
  if (r?.compileError) return t('The code doesn\'t run. See the Tests tab for details.')
  const bad = r?.results?.filter((x) => !x.ok).length || 0
  return t('Failed tests: {0}. See the Tests tab for details.', [bad])
})
</script>

<template>
  <section class="task" :aria-label="t('Exercise')">
    <header class="head">
      <span class="kicker">{{ props.exercise.stage === 'practice' ? t('Guided practice · no grade') : t('Exercise') }}</span>
      <Markdown tag="h1" fit-heading class="title" :src="exercise.title || t('Exercise')" inline />
      <Markdown class="desc" :src="exercise.prompt" />
    </header>

    <ExerciseSupport :exercise="exercise" :busy="busy" />

    <div v-if="exercise.expectedOutput" class="group">
      <span class="label">{{ t('Expected output') }}</span>
      <div class="out"><span class="prompt" aria-hidden="true">›</span>{{ exercise.expectedOutput }}</div>
    </div>

    <div v-if="exercise.requirements?.length" class="group">
      <div class="group-head">
        <span class="label">{{ t('Requirements') }}</span>
        <span class="score" :class="reqState">{{ scoreLabel }}</span>
      </div>
      <ul class="reqs">
        <li v-for="(r, i) in exercise.requirements" :key="i" :class="reqState">
          <span class="dot" aria-hidden="true">{{ reqState === 'ok' ? '✓' : '' }}</span>
          <Markdown inline tag="span" class="rtext" :src="r" />
        </li>
      </ul>
      <span v-if="reqState === 'bad'" class="fail-note">{{ failNote }}</span>
      <span v-else-if="reqState === 'todo'" class="hint-note">{{ t('Run the tests to update the checklist.') }}</span>
    </div>

    <div v-if="tools.length" class="group">
      <span class="label">{{ t('Useful tools · click to learn more') }}</span>
      <div class="chips">
        <UiChip
          v-for="t in tools"
          :key="t.name"
          :class="{ on: openTool === t.name }"
          :pressed="openTool === t.name"
          @click="toggleTool(t.name)"
        >{{ t.name }}</UiChip>
      </div>
      <div v-if="activeTool" class="tool-desc">
        <code>{{ activeTool.name }}</code>
        <Markdown inline tag="span" :src="activeTool.description" />
      </div>
    </div>
    <div v-if="exercise.example" class="card box">
      <span class="label">{{ t('Example') }}</span>
      <Markdown :src="exercise.example" class="ex-md" />
    </div>
    <details v-if="showSolution && exercise.solution" class="card box sol" :open="exercise.stage === 'practice'" @toggle="($event.target as HTMLDetailsElement).open && support?.mark(exercise.id, 'solution')">
      <summary class="label">{{ t('Reference solution') }}</summary>
      <CodeBlock :code="exercise.solution" :language="language" :file-name="fileName" />
    </details>
    <details v-if="showSolution && exercise.solutionFiles?.length" class="card box sol" :open="exercise.stage === 'practice'" @toggle="($event.target as HTMLDetailsElement).open && support?.mark(exercise.id, 'solution')">
      <summary class="label">{{ t('Reference solution') }}</summary>
      <CodeBlock v-for="f in exercise.solutionFiles" :key="f.path" :code="f.content" :language="language" :file-name="f.path" />
    </details>
    <div v-if="exercise.runtime === 'docker'" class="card box hint">
      <span class="label">{{ t('Environment') }}</span>
      <span>{{ t('A real container with no network access. Edit files and run commands in the terminal. Tests:') }}</span>
      <code>{{ exercise.testCommand }}</code>
    </div>
  </section>
</template>

<style scoped>
.task {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow-y: auto;
  overflow-wrap: anywhere;
  padding: clamp(16px, 2.2vw, 24px);
  border: 1px solid var(--border);
  border-radius: 18px;
  background: var(--surface-2);
  scrollbar-gutter: stable;
}
.head {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.kicker {
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--purple-link);
}
.title {
  margin: 0;
  font-size: clamp(1.5rem, 2.2vw, 1.875rem);
  line-height: 1.2;
  font-weight: 900;
}
.title :deep(code) {
  font-size: 0.8em;
}
.desc {
  font-size: 15px;
  line-height: 1.6;
  color: var(--text-2);
}
.group {
  border-top: 1px solid var(--border);
  padding-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.group .label {
  font-size: 11px;
}
.group-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 6px;
}
.out {
  background: #0b0d0f;
  border: 2px solid var(--border);
  border-radius: 12px;
  padding: 10px 14px;
  font-family: var(--mono);
  font-size: 15px;
  color: #c3e88d;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.out .prompt {
  color: #6e777e;
  margin-right: 8px;
}
.score {
  font-size: 12px;
  font-weight: 900;
  border-radius: 8px;
  padding: 2px 8px;
  background: var(--divider);
  color: var(--muted);
}
.score.ok {
  background: var(--green-soft);
  color: var(--green-light);
}
.score.bad {
  background: var(--yellow-bg);
  color: var(--yellow-light);
}
.reqs {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.reqs li {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 6px 0;
}
.dot {
  flex: none;
  width: 22px;
  height: 22px;
  margin-top: 1px;
  box-sizing: border-box;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 13px;
  font-weight: 900;
  background: var(--divider);
  border: 2px solid #3a4247;
  color: var(--green-ink);
  transition: background-color 0.2s, border-color 0.2s;
}
.reqs li.ok .dot {
  background: var(--green);
  border-color: var(--green);
}
.rtext {
  font-size: 15px;
  font-weight: 700;
  line-height: 1.4;
  color: var(--text-2);
}
.reqs li.ok .rtext {
  color: var(--muted);
  text-decoration: line-through;
  text-decoration-color: #3a4247;
}
.fail-note {
  font-size: 13px;
  font-weight: 700;
  color: var(--red-light);
}
.hint-note {
  font-size: 13px;
  font-weight: 600;
  color: #8a939a;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip {
  font-family: var(--mono);
  font-size: 13px;
  font-weight: 700;
  padding: 6px 10px;
  border-radius: 10px;
  cursor: pointer;
  background: var(--surface);
  color: var(--code-ink);
  border: 2px solid var(--border);
}
.chip:hover {
  border-color: #3a4247;
}
.chip.on {
  background: var(--purple-soft);
  color: var(--purple-light);
  border-color: var(--purple);
}
.tool-desc {
  background: #1e1a33;
  border: 2px solid #3a3260;
  border-radius: 12px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 14px;
  font-weight: 700;
  color: #e4e8eb;
  animation: dl-pop 0.2s ease-out;
}
.tool-desc code {
  font-family: var(--mono);
  font-size: 13px;
  color: var(--purple-light);
}
.box {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-radius: 16px;
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
@container (max-width: 760px) {
  .task {
    overflow: visible;
    scrollbar-gutter: auto;
  }
}
</style>
