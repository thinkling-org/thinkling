<script setup lang="ts">
import { t } from '../lib/i18n.ts'
import { nextTick, ref, watch } from 'vue'
import { UiProgress, UiSpinner } from './ui/index.ts'

/** Show the current installation step, download progress and recent logs. */
const props = defineProps({ job: { type: Object, default: null } })
const pre = ref(null)
watch(
  () => props.job?.log?.length,
  () => nextTick(() => pre.value && (pre.value.scrollTop = pre.value.scrollHeight)),
)
</script>

<template>
  <div v-if="job" class="job" :class="job.status">
    <div class="job-head">
      <UiSpinner v-if="job.status === 'running'" size="sm" />
      <strong>{{ job.status === 'done' ? t('Completed') : job.status === 'error' ? t('Error') : job.step || t('Working…') }}</strong>
      <span v-if="job.progress?.label" class="muted">{{ job.progress.label }}</span>
    </div>
    <UiProgress v-if="job.status === 'running' && job.progress?.pct != null" :value="job.progress.pct" :max="100" />
    <p v-if="job.error" class="job-err">{{ job.error }}</p>
    <p v-if="job.message" class="job-message" role="status">{{ job.message }}</p>
    <details v-if="job.status === 'action-required'" class="job-details">
      <summary>{{ t('Show technical details') }}</summary>
      <pre class="job-log">{{ job.log.join('\n') }}</pre>
    </details>
    <pre v-else ref="pre" class="job-log">{{ job.log.join('\n') }}</pre>
  </div>
</template>

<style scoped>
.job {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 2px solid var(--border);
  border-radius: 14px;
  padding: 12px 14px;
  background: var(--surface-2);
}
.job.done {
  border-color: var(--green-border);
}
.job.error {
  border-color: var(--red-border);
}
.job.action-required {
  border-color: var(--yellow-border);
  background: var(--yellow-bg);
}
.job-message {
  margin: 0;
  line-height: 1.5;
  color: var(--yellow-light);
}
.job-details summary {
  cursor: pointer;
  color: var(--muted);
  font-size: 13px;
}
.job-details[open] .job-log {
  margin-top: 8px;
}
.job-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.bar {
  height: 10px;
  flex: none;
}
.job-err {
  margin: 0;
  color: var(--red-light);
  font-weight: 700;
  white-space: pre-wrap;
}
.job-log {
  margin: 0;
  max-height: 160px;
  overflow: auto;
  font-family: var(--mono);
  font-size: 12px;
  color: var(--muted);
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
