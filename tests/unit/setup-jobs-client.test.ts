// @vitest-environment jsdom

import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSetupJobs } from '../../src/composables/useSetupJobs.ts'
import { useApp } from '../../src/stores/app.ts'
import { deferred, mountComposable } from '../helpers/vue.ts'

enableAutoUnmount(afterEach)
const fetchMock = vi.fn<typeof fetch>()
let pinia: ReturnType<typeof createPinia>
let app: ReturnType<typeof useApp>
const running = { kind: 'docker-start', status: 'running', log: 'Starting' }
const status = { jobs: {}, sandbox: { python: { ready: false }, javascript: { ready: true }, go: { ready: false } } }

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset().mockImplementation(async () => Response.json(status))
  pinia = createPinia(); setActivePinia(pinia); app = useApp()
  vi.spyOn(app, 'refreshStatus').mockResolvedValue(undefined)
})
afterEach(() => { disposePinia(pinia); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllTimers(); vi.useRealTimers() })

async function setup() {
  const mounted = mountComposable(useSetupJobs)
  await flushPromises()
  return { jobs: mounted.result, wrapper: mounted.wrapper }
}

describe('setup job polling', () => {
  it('loads status and selects only popular languages that still need an image', async () => {
    const { jobs } = await setup()
    expect(jobs.status.value).toEqual(status)
    expect(jobs.languages.value).toEqual(['python', 'go'])
    expect(jobs.loading.value).toBe(false)
    expect(jobs.job('missing')).toBeNull()
    jobs.toggleLang('go'); jobs.toggleLang('cpp')
    expect(jobs.languages.value).toEqual(['python', 'cpp'])
  })

  it('reports initial failures and recovers on recheck', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Offline'))
    const { jobs } = await setup()
    expect(jobs.startError.value).toBe('Offline')
    await jobs.recheck()
    expect(fetchMock).toHaveBeenCalledWith('/api/setup/refresh', { method: 'POST' })
    expect(jobs.status.value).toEqual(status)
    expect(app.refreshStatus).toHaveBeenCalledTimes(1)
  })

  it('starts a job, polls it and refreshes capabilities after completion', async () => {
    const { jobs } = await setup()
    fetchMock.mockResolvedValueOnce(Response.json(running))
    await jobs.startJob('docker-start', { languages: ['go'] })
    expect(jobs.running('docker-start')).toBe(true)
    expect(jobs.anyRunning.value).toBe(true)
    expect(fetchMock).toHaveBeenLastCalledWith('/api/setup/jobs/docker-start', expect.objectContaining({ method: 'POST', body: '{"languages":["go"]}' }))
    fetchMock.mockResolvedValueOnce(Response.json({ 'docker-start': { ...running, status: 'done' } }))
    await vi.advanceTimersByTimeAsync(1000)
    expect(jobs.anyRunning.value).toBe(false)
    expect(app.refreshStatus).toHaveBeenCalledTimes(1)
    expect(jobs.startError.value).toBe('')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps polling known running jobs after a transient polling failure', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ ...status, jobs: { 'docker-start': running } }))
    const { jobs } = await setup()
    fetchMock.mockRejectedValueOnce(new Error('Transient')).mockResolvedValueOnce(Response.json({ 'docker-start': running }))
    await vi.advanceTimersByTimeAsync(2000)
    expect(jobs.anyRunning.value).toBe(true)
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/setup/jobs')).toHaveLength(2)
    expect(app.refreshStatus).not.toHaveBeenCalled()
  })

  it('reports a rejected start and clears the error when retrying', async () => {
    const { jobs } = await setup()
    fetchMock.mockResolvedValueOnce(Response.json({ error: 'Docker missing' }, { status: 400 }))
    await jobs.startJob('docker-start')
    expect(jobs.startError.value).toBe('Docker missing')
    fetchMock.mockResolvedValueOnce(Response.json(running))
    await jobs.startJob('docker-start')
    expect(jobs.startError.value).toBe('')
    expect(jobs.running('docker-start')).toBe(true)
  })

  it('does not let a stale status response erase a newly started job', async () => {
    const pending = deferred<Response>()
    fetchMock.mockReturnValueOnce(pending.promise)
    const { result: jobs } = mountComposable(useSetupJobs)
    fetchMock.mockResolvedValueOnce(Response.json(running))
    await jobs.startJob('docker-start')
    pending.resolve(Response.json(status))
    await flushPromises()
    expect(jobs.running('docker-start')).toBe(true)
  })

  it('ignores stale polls when a newer job starts', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ ...status, jobs: { 'docker-start': running } }))
    const { jobs } = await setup()
    const pending = deferred<Response>()
    fetchMock.mockReturnValueOnce(pending.promise)
    await vi.advanceTimersByTimeAsync(1000)
    fetchMock.mockResolvedValueOnce(Response.json({ ...running, kind: 'whisper-install' }))
    await jobs.startJob('whisper-install')
    pending.resolve(Response.json({}))
    await flushPromises()
    expect(jobs.running('whisper-install')).toBe(true)
    expect(jobs.running('docker-start')).toBe(true)
  })

  it('cancels scheduled polling and ignores responses after unmount', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ ...status, jobs: { 'docker-start': running } }))
    const { jobs, wrapper } = await setup()
    const pending = deferred<Response>()
    fetchMock.mockReturnValueOnce(pending.promise)
    const starting = jobs.startJob('whisper-install')
    wrapper.unmount()
    pending.resolve(Response.json({ ...running, kind: 'whisper-install' }))
    await starting
    await vi.advanceTimersByTimeAsync(5000)
    expect(jobs.job('whisper-install')).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
