// @vitest-environment jsdom

import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, disposePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useApp } from '../../src/stores/app.ts'
import type { Plan } from '../../src/domain.ts'
import StartView from '../../src/views/StartView.vue'
import PlanView from '../../src/views/PlanView.vue'
import PathView from '../../src/views/PathView.vue'
import FlashcardsView from '../../src/views/FlashcardsView.vue'
import SettingsView from '../../src/views/SettingsView.vue'
import PlaygroundView from '../../src/views/PlaygroundView.vue'

vi.mock('../../src/lib/sfx.ts', () => ({ play: vi.fn(), prepareSfx: vi.fn() }))
vi.mock('../../src/components/SandboxIDE.vue', () => ({ default: { props: ['wsId', 'language', 'mainFile'], template: '<div class="sandbox" :data-language="language">{{ wsId }} {{ mainFile }}</div>' } }))
enableAutoUnmount(afterEach)
let pinia: ReturnType<typeof createPinia>
let app: ReturnType<typeof useApp>

function plan(): Plan {
  return { title: 'JavaScript foundations', summary: 'A practical plan', goal: 'Learn JavaScript', level: 'Intermediate', levelSummary: 'Practice needed', language: 'javascript', durationWeeks: 2, weakSpots: [], createdAt: 1, modules: [
    { id: 'm0', title: 'Functions', description: 'Function basics', week: 1, lessons: [
      { id: 'l0', title: 'Closures', focus: 'Captured variables', kind: 'theory', status: 'done' },
      { id: 'l1', title: 'Callbacks', focus: 'Async callbacks', kind: 'code', status: 'current' },
      { id: 'l2', title: 'Quiz', focus: 'Check understanding', kind: 'test', status: 'locked' },
    ] },
    { id: 'm1', title: 'Objects', description: 'Objects', week: 2, lessons: [{ id: 'l3', title: 'Prototypes', focus: 'Prototype chain', kind: 'code', status: 'locked' }] },
  ] }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
  vi.setSystemTime(new Date(2026, 0, 1, 12))
  pinia = createPinia(); app = useApp(pinia)
  vi.spyOn(app, 'prefetchNext').mockImplementation(() => {})
  vi.spyOn(app, 'generatePlan').mockResolvedValue(undefined)
  vi.spyOn(app, 'refinePlan').mockResolvedValue(undefined)
  vi.spyOn(app, 'saveNow').mockResolvedValue(undefined)
  vi.spyOn(app, 'refreshStatus').mockResolvedValue(undefined)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ models: [] })))
  vi.stubGlobal('confirm', vi.fn().mockReturnValue(false))
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
})
afterEach(() => {
  disposePinia(pinia); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllTimers(); vi.useRealTimers()
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
})

async function render(component: any, path = '/start') {
  const router = createRouter({ history: createMemoryHistory(), routes: ['/', '/start', '/plan', '/path', '/review', '/settings', '/setup', '/lesson/:id'].map((path) => ({ path, component: { template: '<div />' } })) })
  await router.push(path)
  const wrapper = mount(component, { global: { plugins: [pinia, router], stubs: { AppShell: { template: '<main><slot /></main>' } } } })
  await flushPromises()
  return { wrapper, router }
}
const button = (wrapper: Awaited<ReturnType<typeof render>>['wrapper'], text: string) => wrapper.findAll('button').find((button) => button.text() === text)!

describe('new learning plan', () => {
  it('requires a useful description, accepts preferences and submits a trimmed profile', async () => {
    const { wrapper, router } = await render(StartView)
    expect(button(wrapper, 'Generate plan').attributes('disabled')).toBeDefined()
    await wrapper.get('textarea').setValue('  I want to practice JavaScript closures and async functions.  ')
    await button(wrapper, '45 min').trigger('click')
    await button(wrapper, 'Balanced').trigger('click')
    await button(wrapper, 'Generate plan').trigger('click')
    await flushPromises()
    expect(app.generatePlan).toHaveBeenCalledExactlyOnceWith({ description: 'I want to practice JavaScript closures and async functions.', minutesPerDay: 45, style: 'balanced' })
    expect(router.currentRoute.value.path).toBe('/plan')
  })

  it('uses a template and prevents duplicate submissions while generation is running', async () => {
    const { wrapper } = await render(StartView)
    await wrapper.get('.tpl').trigger('click')
    expect(wrapper.get<HTMLTextAreaElement>('textarea').element.value).toContain('senior frontend')
    app.gen.status = 'running'
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter', ctrlKey: true })
    expect(app.generatePlan).not.toHaveBeenCalled()
  })

  it('restores the existing profile and explains replacement and unavailable providers', async () => {
    app.plan = plan()
    app.profile = { description: 'Existing learning goal description', minutesPerDay: 60, style: 'theory' }
    app.status = { providers: { claude: { available: false } } } as any
    const { wrapper } = await render(StartView)
    expect(wrapper.get<HTMLTextAreaElement>('textarea').element.value).toBe(app.profile.description)
    expect(wrapper.get('.warn').text()).toContain('JavaScript foundations')
    expect(wrapper.text()).toContain('CLI not found')
    expect(button(wrapper, '60+ min').attributes('aria-checked')).toBe('true')
  })
})

describe('plan preview and revision', () => {
  it('shows partial progress as plan modules arrive', async () => {
    app.gen.status = 'running'
    const { wrapper } = await render(PlanView, '/plan')
    expect(wrapper.get('h1').text()).toBe('Building your study plan')
    expect(wrapper.findAll('.step.active')).toHaveLength(1)
    app.gen.partial = { goal: 'Learn JS', level: 'Beginner', modules: plan().modules }
    await flushPromises()
    expect(wrapper.findAll('.step.done')).toHaveLength(2)
    expect(wrapper.text()).toContain('2 ready')
    expect(wrapper.get('#refine').attributes('disabled')).toBeDefined()
  })

  it('expands modules, submits revisions and starts the learning path', async () => {
    app.plan = plan()
    const { wrapper, router } = await render(PlanView, '/plan')
    await wrapper.get('.mod-head').trigger('click')
    expect(wrapper.text()).toContain('Captured variables')
    expect(wrapper.get('a[href="/lesson/l0"]').text()).toBe('Review')
    expect(wrapper.get('a[href="/lesson/l1"]').text()).toBe('Start')
    expect(wrapper.find('a[href="/lesson/l2"]').exists()).toBe(false)
    await wrapper.get('#refine').setValue('  Add more practice  ')
    await wrapper.get('form').trigger('submit')
    expect(app.refinePlan).toHaveBeenCalledWith('Add more practice')
    expect(wrapper.get<HTMLInputElement>('#refine').element.value).toBe('')
    await button(wrapper, 'Go to the learning path').trigger('click')
    await flushPromises()
    expect(app.prefetchNext).toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.path).toBe('/path')
  })

  it('retries a failed first generation using the saved profile', async () => {
    app.profile = { description: 'Learn JavaScript functions', minutesPerDay: 30, style: 'code' }
    app.gen.status = 'error'; app.gen.error = 'Provider offline'
    const { wrapper } = await render(PlanView, '/plan')
    expect(wrapper.get('.err').text()).toContain('Provider offline')
    await button(wrapper, 'Try again').trigger('click')
    expect(app.generatePlan).toHaveBeenCalledWith(app.profile)
  })

  it('returns to the original plan after a failed revision', async () => {
    app.plan = plan(); app.gen.status = 'error'; app.gen.mode = 'refinePlan'
    const { wrapper } = await render(PlanView, '/plan')
    await button(wrapper, 'OK').trigger('click')
    expect(app.gen.status).toBe('done')
    expect(wrapper.find('.err').exists()).toBe(false)
  })
})

describe('learning path', () => {
  it('opens lesson details, gates locked lessons, navigates to current lessons and removes weak points', async () => {
    app.plan = plan(); app.weakSpots = ['Closures']
    const { wrapper, router } = await render(PathView, '/path')
    expect(app.prefetchNext).toHaveBeenCalledTimes(1)
    await wrapper.get('.node.locked').trigger('click')
    expect(wrapper.get('[role="dialog"]').text()).toContain('Complete earlier lessons')
    expect(wrapper.find('[role="dialog"] button').exists()).toBe(false)
    await wrapper.get('.node.current').trigger('click')
    expect(wrapper.get('[role="dialog"]').attributes('aria-label')).toBe('Callbacks')
    await wrapper.get('[role="dialog"] button').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/lesson/l1')
    await wrapper.get('[aria-label="Remove Closures"]').trigger('click')
    expect(app.weakSpots).toEqual([])
    await wrapper.get('.path').trigger('click')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('shows completion and caps daily progress at 100 percent', async () => {
    app.plan = plan()
    app.plan.modules.forEach((module) => module.lessons.forEach((lesson) => { lesson.status = 'done' }))
    app.addTime(3600)
    const { wrapper } = await render(PathView, '/path')
    expect(wrapper.text()).toContain('Plan complete!')
    expect(wrapper.findAll('.banner.done')).toHaveLength(2)
    expect(wrapper.get('.goal .bar div').attributes('style')).toContain('width: 100%')
    await wrapper.get('.node.done').trigger('click')
    expect(wrapper.get('[role="dialog"] button').text()).toBe('Review +5 XP')
  })
})

describe('flashcard library', () => {
  it('shows the empty-deck state', async () => {
    const { wrapper } = await render(FlashcardsView)
    expect(wrapper.get('.empty').text()).toContain('Your deck is empty')
    expect(wrapper.find('a[href="/review?all=1"]').exists()).toBe(false)
  })

  it('sorts, filters, searches, expands and deletes cards', async () => {
    app.addFlashcards([{ front: 'Closures', back: 'Captured variables' }, { front: 'Promises', back: 'Future result' }, { front: 'Arrays', back: 'Indexed collection' }], 'Functions')
    app.flashcards[0].due += 86_400_000
    app.flashcards[0].interval = 4
    app.flashcards[1].lapses = 1
    const { wrapper } = await render(FlashcardsView)
    expect(wrapper.findAll('.f').map((item) => item.text())).toEqual(['Promises', 'Arrays', 'Closures'])
    await button(wrapper, 'Hard').trigger('click')
    expect(wrapper.findAll('.f').map((item) => item.text())).toEqual(['Promises'])
    await button(wrapper, 'Due for review').trigger('click')
    expect(wrapper.findAll('.item')).toHaveLength(2)
    await button(wrapper, 'All').trigger('click')
    await wrapper.get('input').setValue('CAPTURED')
    expect(wrapper.findAll('.item')).toHaveLength(1)
    await wrapper.get('.ih').trigger('click')
    expect(wrapper.get('.back').text()).toBe('Captured variables')
    await button(wrapper, 'Delete').trigger('click')
    expect(app.flashcards).toHaveLength(2)
    expect(wrapper.get('.empty').text()).toContain('No flashcards match')
  })
})

describe('settings and playground', () => {
  it('changes sound and runtime settings and saves CLI paths', async () => {
    app.docker = { available: true, version: 'test' }
    const { wrapper } = await render(SettingsView, '/settings')
    await button(wrapper, 'Off').trigger('click')
    expect(app.settings.sound).toBe(false)
    expect(wrapper.get('input[type="range"]').attributes('disabled')).toBeDefined()
    await button(wrapper, 'On').trigger('click')
    await wrapper.get('input[type="range"]').setValue('0.25')
    expect(app.settings.volume).toBe(0.25)
    await button(wrapper, 'In a container — Node and terminal').trigger('click')
    expect(app.settings.jsRuntime).toBe('docker')
    await wrapper.get('#cbin').setValue('C:/bin/claude.exe')
    await wrapper.get('#cbin').trigger('change')
    await flushPromises()
    expect(app.settings.claudeBin).toBe('C:/bin/claude.exe')
    expect(app.saveNow).toHaveBeenCalled()
    expect(app.refreshStatus).toHaveBeenCalled()
  })

  it('only resets learning data after confirmation and navigates to a new plan', async () => {
    app.plan = plan(); app.addXp(10)
    const { wrapper, router } = await render(SettingsView, '/settings')
    await button(wrapper, 'Clear all data').trigger('click')
    expect(app.stats.xp).toBe(10)
    vi.mocked(confirm).mockReturnValue(true)
    await button(wrapper, 'Clear all data').trigger('click')
    await flushPromises()
    expect(app.plan).toBeNull()
    expect(app.stats.xp).toBe(0)
    expect(router.currentRoute.value.path).toBe('/start')
  })

  it('opens the setup wizard', async () => {
    const { wrapper, router } = await render(SettingsView, '/settings')
    await button(wrapper, 'Setup wizard').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/setup')
  })

  it('uses the plan language and switches sandbox starters', async () => {
    app.plan = { ...plan(), language: 'go' }
    app.docker = { available: true, envs: { go: 'Go', python: 'Python', unknown: 'Unknown' } }
    const { wrapper } = await render(PlaygroundView)
    expect(wrapper.get('.sandbox').attributes('data-language')).toBe('go')
    await button(wrapper, 'Python').trigger('click')
    expect(wrapper.get('.sandbox').attributes('data-language')).toBe('python')
    expect(wrapper.get('.sandbox').text()).toContain('play-python')
    expect(wrapper.text()).not.toContain('Unknown')
  })

  it('rechecks status when Docker is unavailable', async () => {
    app.docker = { available: false }
    const { wrapper } = await render(PlaygroundView)
    expect(wrapper.text()).toContain("Docker isn't running.")
    await button(wrapper, 'check again').trigger('click')
    expect(app.refreshStatus).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.sandbox').exists()).toBe(false)
  })
})
