// @vitest-environment jsdom

import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createPinia, disposePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LessonView from '../../src/views/LessonView.vue'
import ExerciseFooter from '../../src/components/exercises/ExerciseFooter.vue'
import { useApp } from '../../src/stores/app.ts'
import { configureLocale } from '../../src/lib/i18n.ts'
import type { Exercise } from '../../src/domain.ts'

const { grade } = vi.hoisted(() => ({ grade: vi.fn() }))
vi.mock('../../src/lib/api.ts', () => ({ ai: grade, getJSON: vi.fn(), putJSON: vi.fn() }))
vi.mock('../../src/lib/sfx.ts', () => ({ play: vi.fn(), prepareSfx: vi.fn() }))
vi.mock('../../src/components/exercises/CodeExercise.vue', () => ({ default: { template: '<div />' } }))

let pinia: ReturnType<typeof createPinia>
let app: ReturnType<typeof useApp>
const scrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView')

enableAutoUnmount(afterEach)

beforeEach(() => {
  pinia = createPinia()
  app = useApp(pinia)
  configureLocale(() => 'en')
  grade.mockReset()
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
  app.plan = {
    title: 'Go', summary: '', goal: '', level: 'beginner', levelSummary: '', language: 'go',
    durationWeeks: 1, weakSpots: [], createdAt: Date.now(),
    modules: [{ id: 'module', title: 'Basics', week: 1, description: '', lessons: [
      { id: 'lesson', title: 'Modules and running', kind: 'mixed', focus: '', status: 'current' },
    ] }],
  }
  const exercises: Exercise[] = [
    { id: 'learn', type: 'learn', stage: 'learn', prompt: 'Running Go programs' },
    { id: 'practice', type: 'choice', stage: 'practice', prompt: 'Which command runs the program?', options: ['go run .', 'go mod init .'], correctIndex: 0, explanation: 'Use go run .' },
    { id: 'check', type: 'choice', stage: 'check', prompt: 'Check your knowledge', options: ['go run .', 'go main'], correctIndex: 0, explanation: 'Run the current package.' },
    { id: 'open', type: 'open', stage: 'check', prompt: 'Explain modules', referenceAnswer: 'A module groups Go packages.' },
  ]
  app.lessons.lesson = { intro: { summary: 'Learn Go commands' }, exercises, flashcards: [], generatedAt: Date.now(), format: 3 }
  vi.spyOn(app, 'ensureLesson').mockResolvedValue(app.lessons.lesson)
})

afterEach(() => {
  disposePinia(pinia)
  configureLocale(() => 'en')
  vi.restoreAllMocks()
  if (scrollIntoView) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scrollIntoView)
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
})

async function openLesson() {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/lesson/:id', component: LessonView }, { path: '/path', component: { template: '<main />' } },
  ] })
  await router.push('/lesson/lesson')
  const wrapper = mount(LessonView, { global: { plugins: [pinia, router], stubs: {
    AskDrawer: { template: '<div />', methods: { reset() {} } },
    LearnCard: { props: ['exercise', 'comparisonStep'], template: '<section><h1>{{ exercise.prompt }}</h1><p>{{ comparisonStep?.say }}</p></section>' },
  } } })
  await flushPromises()
  return wrapper
}

async function click(wrapper: VueWrapper, label: string) {
  const button = wrapper.findAll('button').find((item) => item.text() === label)
  expect(button, `Button “${label}”`).toBeDefined()
  await button!.trigger('click')
  await flushPromises()
}

async function reachCheck(wrapper: VueWrapper) {
  await click(wrapper, 'Start learning')
  await click(wrapper, 'Got it')
  await click(wrapper, 'Show solution')
  await click(wrapper, 'Continue')
}

describe('lesson back navigation', () => {
  it('returns to the preceding exercise, preserving an unchecked answer and the current route', async () => {
    const wrapper = await openLesson()
    await click(wrapper, 'Start learning')
    await click(wrapper, 'Got it')
    await wrapper.findAll('[role="radio"]')[0].trigger('click')
    await click(wrapper, 'Go back')
    expect(wrapper.get('h1').text()).toBe('Running Go programs')
    expect(wrapper.get('.count').text()).toBe('1 / 4')
    await click(wrapper, 'Got it')
    expect(wrapper.get('.count').text()).toBe('2 / 4')
    expect(wrapper.findAll('[role="radio"]')[0].attributes('aria-checked')).toBe('true')
    expect(app.stats.history).toHaveLength(0)
  })

  it('returns from the first exercise to the introduction and allows starting again', async () => {
    const wrapper = await openLesson()
    await click(wrapper, 'Start learning')
    await click(wrapper, 'Go back')
    expect(wrapper.text()).toContain('Learn Go commands')
    expect(wrapper.find('.count').exists()).toBe(false)
    await click(wrapper, 'Start learning')
    expect(wrapper.get('.count').text()).toBe('1 / 4')
    expect(wrapper.get('h1').text()).toBe('Running Go programs')
  })

  it('keeps graded feedback when revisiting and does not count skip or recheck actions twice', async () => {
    const wrapper = await openLesson()
    await reachCheck(wrapper)
    await wrapper.findAll('[role="radio"]')[0].trigger('click')
    await click(wrapper, 'Check')
    expect(app.stats.history).toHaveLength(1)
    expect(wrapper.text()).toContain('Great work!')
    await click(wrapper, 'Go back')
    expect(wrapper.get('.count').text()).toBe('2 / 4')
    await click(wrapper, 'Continue')
    expect(wrapper.text()).toContain('Great work!')
    wrapper.findComponent(ExerciseFooter).vm.$emit('skip')
    wrapper.findComponent(ExerciseFooter).vm.$emit('check')
    await flushPromises()
    expect(app.stats.history).toHaveLength(1)
    expect(wrapper.text()).toContain('Great work!')
  })

  it('disables back navigation while an answer is being graded', async () => {
    const pending = Promise.withResolvers<{ score: number; verdict: string }>()
    grade.mockReturnValue(pending.promise)
    const wrapper = await openLesson()
    await reachCheck(wrapper)
    await wrapper.findAll('[role="radio"]')[0].trigger('click')
    await click(wrapper, 'Check')
    await click(wrapper, 'Continue')
    await wrapper.get('textarea').setValue('A module groups packages')
    await click(wrapper, 'Check')
    expect(wrapper.get<HTMLButtonElement>('button[aria-label="Previous step"]').element.disabled).toBe(true)
    wrapper.findComponent(ExerciseFooter).vm.$emit('back')
    await flushPromises()
    expect(wrapper.get('.count').text()).toBe('4 / 4')
    pending.resolve({ score: 10, verdict: 'correct' })
    await flushPromises()
    expect(wrapper.get<HTMLButtonElement>('button[aria-label="Previous step"]').element.disabled).toBe(false)
    await click(wrapper, 'Go back')
    expect(wrapper.get('.count').text()).toBe('3 / 4')
  })

  it('goes back one explanation step before leaving an example', async () => {
    app.lessons.lesson.exercises[0].visualization = {
      type: 'code-comparison', variants: ['A', 'B'].map((label) => ({
        label, code: 'first\nsecond', outcome: 'Done',
        steps: [{ line: 1, say: 'First line' }, { line: 2, say: 'Second line' }],
      })),
    }
    const wrapper = await openLesson()
    await click(wrapper, 'Start learning')
    expect(wrapper.text()).toContain('First line')
    await click(wrapper, 'Next step')
    expect(wrapper.text()).toContain('Second line')
    await click(wrapper, 'Go back')
    expect(wrapper.text()).toContain('First line')
    expect(wrapper.get('.count').text()).toBe('1 / 4')
  })
})
