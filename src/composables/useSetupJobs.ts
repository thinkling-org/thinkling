import { computed, onMounted, onScopeDispose, shallowRef } from 'vue'
import { getJSON } from '../lib/api.ts'
import { POPULAR_SANDBOX_LANGUAGES } from '../lib/setup-options.ts'
import { useApp } from '../stores/app.ts'
import type { SetupJob, SetupStatus } from '../domain.ts'

export function useSetupJobs() {
  const app = useApp()
  const status = shallowRef<SetupStatus | null>(null)
  const jobs = shallowRef<Record<string, SetupJob>>({})
  const loading = shallowRef(false)
  const startError = shallowRef('')
  const languages = shallowRef<string[]>([])
  const anyRunning = computed(() => Object.values(jobs.value).some((job) => job?.status === 'running'))
  let pollTimer: ReturnType<typeof setTimeout> | null = null
  let jobsVersion = 0
  let disposed = false

  const job = (kind: string) => jobs.value[kind] || null
  const running = (kind: string) => job(kind)?.status === 'running'

  async function loadStatus() {
    const version = jobsVersion
    loading.value = true
    try {
      const data = await getJSON<SetupStatus>('/api/setup/status')
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
      const next = await getJSON<Record<string, SetupJob>>('/api/setup/jobs')
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

  async function startJob(kind: string, body: { languages?: string[] } = {}) {
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

  function toggleLang(id: string) {
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
