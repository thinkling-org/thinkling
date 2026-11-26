// @vitest-environment jsdom

import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createPinia, disposePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LessonView from '../../src/views/LessonView.vue'
import { useApp } from '../../src/stores/app.ts'
import { configureLocale } from '../../src/lib/i18n.ts'
import type { Exercise, TestRun } from '../../src/domain.ts'

const { ai, runCode } = vi.hoisted(() => ({ ai: vi.fn(), runCode: vi.fn<() => Promise<TestRun>>() }))
vi.mock('../../src/lib/api.ts', () => ({ ai, getJSON: vi.fn(), putJSON: vi.fn() }))
vi.mock('../../src/lib/sfx.ts', () => ({ play: vi.fn(), prepareSfx: vi.fn() }))
vi.mock('../../src/components/SandboxIDE.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../../src/components/exercises/BrowserCodeWorkspace.vue', () => ({ default: {
  inheritAttrs: false, props: ['modelValue'], emits: ['update:modelValue', 'run'],
  template: '<textarea aria-label="Practice code" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  methods: { async runAll(this: { $emit: (event: string, result: TestRun) => void }) { const result = await runCode(); this.$emit('run', result); return result }, showReview() {} },
} }))

let pinia: ReturnType<typeof createPinia>
let app: ReturnType<typeof useApp>
enableAutoUnmount(afterEach)
const scrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView')

beforeEach(() => {
  pinia = createPinia(); app = useApp(pinia)
  configureLocale(() => 'en')
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
  runCode.mockReset().mockResolvedValue({ results: [{ name: 'output', ok: true }] })
  ai.mockReset().mockImplementation(async (task) => task === 'reviewCode'
    ? { passed: true, score: 10, summary: 'The requirement is met.', issues: [] }
    : { score: 10, verdict: 'correct', points: [], headline: 'The mechanism is clear.' })
  const support = {
    hints: ['Look at the return value.', 'Return twice the argument.'],
    syntax: [{ title: 'A return expression', code: 'function addOne(value) { return value + 1 }', explanation: 'Return the computed result.' }],
  }
  const code: Exercise = {
    id: 'complete', type: 'code', stage: 'practice', prompt: 'Complete one return expression.',
    title: 'Complete the expression', codeLanguage: 'javascript', runtime: 'browser',
    starterCode: 'function double(value) { /* TODO */ }', solution: 'function double(value) { return value * 2 }',
    requirements: ['Return twice the supplied value.'], testsStatus: 'verified', explanation: 'Multiplication doubles the value.', ...support,
  }
  app.plan = {
    title: 'Functions', summary: '', goal: '', level: 'beginner', levelSummary: '', language: 'javascript',
    durationWeeks: 1, weakSpots: [], createdAt: Date.now(), modules: [{
      id: 'module', title: 'Basics', week: 1, description: '', lessons: [{
        id: 'lesson', title: 'Returning values', kind: 'code', focus: '', status: 'current',
      }],
    }],
  }
  app.lessons.lesson = {
    format: 4, generatedAt: Date.now(), flashcards: [], intro: { outcome: 'Return values.', relevance: 'Transform input.', focus: 'The return expression.' },
    exercises: [
      { id: 'learn', type: 'learn', stage: 'learn', prompt: 'A worked example' },
      { id: 'predict', type: 'choice', stage: 'practice', prompt: 'What is returned?', options: ['Two', 'One'], correctIndex: 0, explanation: 'The expression doubles the value.', hints: ['Look at the expression.'] },
      code,
      { ...code, id: 'modify', title: 'Change one expression' },
      { id: 'explain', type: 'open', stage: 'practice', prompt: 'Explain the return expression.', referenceAnswer: 'It computes and returns a value.', explanation: 'The caller receives the result.', hints: ['Consider the caller.'] },
      { ...code, id: 'apply', stage: 'check', title: 'Apply it to a similar task' },
      { id: 'recall', type: 'open', stage: 'check', prompt: 'Explain it in your own words.', referenceAnswer: 'A function returns a value.' },
    ],
  }
  vi.spyOn(app, 'ensureLesson').mockResolvedValue(app.lessons.lesson)
})

afterEach(() => {
  disposePinia(pinia); configureLocale(() => 'en'); vi.restoreAllMocks()
  if (scrollIntoView) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scrollIntoView)
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
})

async function click(wrapper: VueWrapper, label: string) {
  const button = wrapper.findAll('button').find((item) => item.text() === label)
  expect(button, label).toBeDefined()
  await button!.trigger('click'); await flushPromises()
}

describe('guided learning loop', () => {
  it('progresses from small attempts and optional help to a similar check, keeping practice out of grades', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/lesson/:id', component: LessonView }] })
    await router.push('/lesson/lesson')
    const wrapper = mount(LessonView, { global: { plugins: [pinia, router], stubs: {
      AskDrawer: { template: '<div />', methods: { reset() {} } },
      LearnCard: { template: '<h1>A worked example</h1>' },
    } } })
    await flushPromises()
    await click(wrapper, 'Start learning'); await click(wrapper, 'Got it')
    await wrapper.findAll('[role="radio"]')[0].trigger('click')
    await click(wrapper, 'Check practice answer'); await click(wrapper, 'Continue')

    expect(wrapper.text()).toContain('Guided practice · no grade')
    expect(wrapper.find('.sol').exists()).toBe(false)
    await click(wrapper, 'Hint me a step')
    expect(wrapper.text()).toContain('Look at the return value.')
    expect(wrapper.text()).not.toContain('Return twice the argument.')
    await click(wrapper, 'Next hint'); await click(wrapper, 'Remind me of the syntax')
    expect(wrapper.text()).toContain('A return expression')
    await wrapper.get('textarea').setValue('function double(value) { return value }')
    runCode.mockResolvedValueOnce({ results: [{ name: 'output', ok: false }] })
    await click(wrapper, 'Check practice answer')
    expect(wrapper.text()).toContain('Try this part again')
    expect(wrapper.find('.sol').exists()).toBe(false)
    expect(ai).not.toHaveBeenCalled()
    await click(wrapper, 'Try again')
    await wrapper.get('textarea').setValue('function double(value) { return value * 2 }')
    await click(wrapper, 'Check practice answer')
    expect(wrapper.text()).toContain('This part works')
    expect(app.stats.history).toHaveLength(0)
    await click(wrapper, 'Continue')

    expect(wrapper.text()).not.toContain('Look at the return value.')
    await click(wrapper, 'Show solution')
    expect(wrapper.get<HTMLDetailsElement>('.sol').element.open).toBe(true)
    await click(wrapper, 'Continue')
    await wrapper.get('textarea').setValue('It computes and returns a value')
    await click(wrapper, 'Check practice answer')
    expect(wrapper.find('.grade').exists()).toBe(false)
    expect(app.stats.history).toHaveLength(0)
    await click(wrapper, 'Continue')

    await click(wrapper, 'Remind me of the syntax')
    await click(wrapper, 'Check with Claude')
    expect(app.stats.history).toHaveLength(1)
    await click(wrapper, 'Continue')
    await wrapper.get('textarea').setValue('The caller receives the returned result')
    await click(wrapper, 'Check'); await click(wrapper, 'Continue')
    expect(wrapper.text()).toContain('Lesson complete!')
    expect(wrapper.text()).toContain('Solved on your own: 1 / 2')
    expect(wrapper.text()).toContain('Solved with support: 1')
    expect(app.stats.history).toHaveLength(2)
    expect(app.stats.xp).toBe(50)
  })
})
