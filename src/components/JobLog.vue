<script setup>
import { t } from '../lib/i18n.js'
import { nextTick, ref, watch } from 'vue'

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
      <span v-if="job.status === 'running'" class="spinner sm" />
      <strong>{{ job.status === 'done' ? t('Completed') : job.status === 'error' ? t('Error') : job.step || t('Working…') }}</strong>
      <span v-if="job.progress?.label" class="muted">{{ job.progress.label }}</span>
    </div>
    <div v-if="job.status === 'running' && job.progress?.pct != null" class="bar"><div :style="{ width: `${job.progress.pct}%` }" /></div>
    <p v-if="job.error" class="job-err">{{ job.error }}</p>
    <pre ref="pre" class="job-log">{{ job.log.join('\n') }}</pre>
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
.spinner.sm {
  width: 16px;
  height: 16px;
  border-width: 2px;
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
