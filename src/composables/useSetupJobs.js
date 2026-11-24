import { computed, onMounted, onScopeDispose, shallowRef } from 'vue'
import { getJSON } from '../lib/api.js'
import { POPULAR_SANDBOX_LANGUAGES } from '../lib/setup-options.js'
import { useApp } from '../stores/app.js'

export function useSetupJobs() {
  const app = useApp()
  const status = shallowRef(null)
  const jobs = shallowRef({})
  const loading = shallowRef(false)
  const startError = shallowRef('')
  const languages = shallowRef([])
  const anyRunning = computed(() => Object.values(jobs.value).some((job) => job?.status === 'running'))
  let pollTimer
  let jobsVersion = 0
  let disposed = false

  const job = (kind) => jobs.value[kind] || null
  const running = (kind) => job(kind)?.status === 'running'

  async function loadStatus() {
    const version = jobsVersion
    loading.value = true
    try {
      const data = await getJSON('/api/setup/status')
      if (disposed) return
      status.value = data
      if (version === jobsVersion) jobs.value = data.jobs || {}
      if (data.sandbox && !languages.value.length) {
        languages.value = POPULAR_SANDBOX_LANGUAGES.filter((id) => data.sandbox[id] && !data.sandbox[id].ready)
      }
    } catch (error) {
      if (!disposed) startError.value = error.message
    } finally {
      loading.value = false
    }
    if (anyRunning.value) schedulePoll()
  }

  async function recheck() {
    await fetch('/api/setup/refresh', { method: 'POST' }).catch(() => {})
    if (disposed) return
    await loadStatus()
    if (!disposed) app.refreshStatus()
  }

  function schedulePoll() {
    if (disposed || pollTimer) return
    pollTimer = setTimeout(pollJobs, 1000)
  }

  async function pollJobs() {
    const version = jobsVersion
    try {
      const next = await getJSON('/api/setup/jobs')
      if (!disposed && version === jobsVersion) jobs.value = next
    } catch {
      // Keep polling known running jobs after a transient error.
    } finally {
      pollTimer = null
    }
    if (disposed) return
    if (anyRunning.value) schedulePoll()
    else await recheck()
  }

  async function startJob(kind, body = {}) {
    startError.value = ''
    try {
      const response = await fetch(`/api/setup/jobs/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json()
      if (disposed) return
      if (!response.ok) throw new Error(data.error || response.status)
      jobsVersion++
      jobs.value = { ...jobs.value, [kind]: data }
      schedulePoll()
    } catch (error) {
      if (!disposed) startError.value = error.message
    }
  }

  function toggleLang(id) {
    const selected = languages.value
    languages.value = selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]
  }

  onMounted(loadStatus)
  onScopeDispose(() => {
    disposed = true
    clearTimeout(pollTimer)
  })

  return { status, loading, startError, languages, anyRunning, recheck, startJob, job, running, toggleLang }
}
