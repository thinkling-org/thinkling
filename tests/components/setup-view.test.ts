// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils'
import { createPinia, disposePinia } from 'pinia'
import { computed, nextTick, shallowRef } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SetupView from '../../src/views/SetupView.vue'
import JobLog from '../../src/components/JobLog.vue'
import { configureLocale } from '../../src/lib/i18n.ts'
import type { SetupJob, SetupStatus } from '../../src/domain.ts'

const mocks = vi.hoisted(() => ({ useSetupJobs: vi.fn() }))
vi.mock('../../src/composables/useSetupJobs.ts', () => ({ useSetupJobs: mocks.useSetupJobs }))
vi.mock('vue-router', () => ({ useRoute: () => ({ query: { step: 'docker' } }), useRouter: () => ({ push: vi.fn() }) }))

let pinia: ReturnType<typeof createPinia>
let status: ReturnType<typeof shallowRef<SetupStatus>>
let jobs: ReturnType<typeof shallowRef<Record<string, SetupJob>>>
let startJob: ReturnType<typeof vi.fn>

enableAutoUnmount(afterEach)

beforeEach(() => {
  pinia = createPinia()
  configureLocale(() => 'en')
  status = shallowRef<SetupStatus>({
    platform: 'win32',
    docker: { running: false, installed: false, problem: 'missing', help: {
      autoInstall: true, install: ['winget install -e --id Docker.DockerDesktop'],
      link: 'https://docs.docker.com/desktop/setup/install/windows-install/',
    } },
    providers: {} as SetupStatus['providers'],
    dictation: { installed: false, pythonTested: false, downloadMB: 560 },
    sandbox: null, jobs: {},
  })
  jobs = shallowRef<Record<string, SetupJob>>({})
  startJob = vi.fn()
  mocks.useSetupJobs.mockReturnValue({
    status, loading: shallowRef(false), startError: shallowRef(''), languages: shallowRef([]),
    anyRunning: computed(() => Object.values(jobs.value).some((job) => job.status === 'running')),
    recheck: vi.fn(), startJob, job: (kind: string) => jobs.value[kind],
    running: (kind: string) => jobs.value[kind]?.status === 'running', toggleLang: vi.fn(),
  })
})

afterEach(() => {
  disposePinia(pinia)
  configureLocale(() => 'en')
})

function render() {
  return mount(SetupView, { global: { plugins: [pinia], stubs: { RouterLink: true } } })
}

describe('Docker setup screen', () => {
  it('starts installation from one button and keeps manual commands collapsed', async () => {
    const wrapper = render()
    expect(wrapper.text()).toContain('Windows may need a restart')
    expect(wrapper.get<HTMLDetailsElement>('details.manual-install').element.open).toBe(false)
    const button = wrapper.findAll('button').find((item) => item.text() === 'Install Docker Desktop')!
    await button.trigger('click')
    expect(startJob).toHaveBeenCalledWith('docker-install')
    expect(wrapper.findAll('button').some((item) => item.text().includes('Not now'))).toBe(true)
  })

  it('offers the official download when winget is unavailable, without an unusable winget command', () => {
    status.value.docker.help.autoInstall = false
    const wrapper = render()
    expect(wrapper.text()).toContain('Automatic installation is unavailable')
    expect(wrapper.get('a.btn-primary').attributes('href')).toBe(status.value.docker.help.link)
    expect(wrapper.text()).not.toContain('winget install')
    expect(wrapper.findAll('button').some((item) => item.text() === 'Install Docker Desktop')).toBe(false)
  })

  it('shows restart instructions without an error or reinstall button, then clears the notice once Docker is ready', async () => {
    jobs.value = { 'docker-install': {
      kind: 'docker-install', status: 'action-required', step: 'Restart Windows to finish installation',
      message: 'Save your work, restart Windows, then click “Check again”.', log: ['Installer output'],
    } }
    const wrapper = render()
    expect(wrapper.get('.tag-yellow').text()).toBe('Needs your attention')
    expect(wrapper.get('[role="status"]').text()).toContain('restart Windows')
    expect(wrapper.find('.job.error').exists()).toBe(false)
    expect(wrapper.findAll('button').some((item) => item.text() === 'Install Docker Desktop')).toBe(false)
    expect(wrapper.findComponent(JobLog).get<HTMLDetailsElement>('details').element.open).toBe(false)

    status.value = { ...status.value, docker: { ...status.value.docker, installed: true, running: true } }
    await nextTick()
    expect(wrapper.find('.job.action-required').exists()).toBe(false)
    expect(wrapper.get('.tag-green').text()).toContain('Docker is running')
  })
})
