// @vitest-environment jsdom

import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BrowserCodeWorkspace from '../../src/components/exercises/BrowserCodeWorkspace.vue'
import { runTests } from '../../src/lib/runner.ts'
import { play } from '../../src/lib/sfx.ts'
import { deferred } from '../helpers/vue.ts'
import type { TestRun } from '../../src/domain.ts'

vi.mock('../../src/lib/runner.ts', async (original) => ({ ...await original<typeof import('../../src/lib/runner.ts')>(), runTests: vi.fn() }))
vi.mock('../../src/lib/sfx.ts', () => ({ play: vi.fn(), prepareSfx: vi.fn() }))
vi.mock('../../src/components/CodeEditor.vue', () => ({ default: {
  props: ['modelValue', 'readOnly'], emits: ['update:modelValue', 'cursor', 'apply', 'dismiss', 'submit'],
  template: '<textarea :value="modelValue" :readonly="readOnly" @input="$emit(\'update:modelValue\', $event.target.value)" @keydown.ctrl.enter="$emit(\'submit\')" />',
} }))
enableAutoUnmount(afterEach)
beforeEach(() => vi.resetAllMocks())
const props = { exercise: { id: 'code', tests: 'test("answer", () => expect(answer()).toBe(42))', testsStatus: 'verified' }, language: 'javascript', languageLabel: 'JavaScript', fileName: 'main.js', ext: 'js', providerName: 'Claude', modelValue: 'function answer() { return 42 }' }
const render = (extra = {}) => mount(BrowserCodeWorkspace, { props: { ...props, ...extra }, global: { plugins: [createPinia()] } })

describe('browser coding workspace', () => {
  it('runs the current solution, renders results and emits them for assessment', async () => {
    vi.mocked(runTests).mockResolvedValue({ results: [{ name: 'answer', ok: true }], logs: [{ level: 'log', text: '42' }] })
    const wrapper = render()
    await wrapper.get('.run').trigger('click')
    await flushPromises()
    expect(runTests).toHaveBeenCalledWith({ code: props.modelValue, tests: props.exercise.tests, language: 'javascript' })
    expect(wrapper.get('.pbody').text()).toContain('answer')
    expect(wrapper.findAll('.ptabs button')[0].text()).toBe('Tests 1/1')
    expect(wrapper.emitted('run')).toEqual([[{ results: [{ name: 'answer', ok: true }], logs: [{ level: 'log', text: '42' }] }]])
    expect(play).toHaveBeenCalledWith('sparkle')
    await wrapper.findAll('.ptabs button')[1].trigger('click')
    expect(wrapper.get('.pbody').text()).toBe('42')
  })

  it('shows compilation failures, empty test runs and missing logs', async () => {
    const wrapper = render()
    vi.mocked(runTests).mockResolvedValueOnce({ results: [], compileError: 'Unexpected token' }).mockResolvedValueOnce({ results: [] })
    await wrapper.get('.run').trigger('click'); await flushPromises()
    expect(wrapper.get('.pbody').text()).toContain('Unexpected token')
    expect(play).toHaveBeenCalledWith('pop', 0.6)
    await wrapper.get('.run').trigger('click'); await flushPromises()
    expect(wrapper.get('.pbody').text()).toContain('There are no tests to run.')
    await wrapper.findAll('.ptabs button')[1].trigger('click')
    expect(wrapper.get('.pbody').text()).toContain('No logs.')
  })

  it('disables duplicate runs while waiting and suppresses sounds during assessment', async () => {
    const pending = deferred<TestRun>()
    vi.mocked(runTests).mockReturnValueOnce(pending.promise)
    const wrapper = render({ busy: true })
    await wrapper.get('.run').trigger('click')
    expect(wrapper.get('.run').attributes('disabled')).toBeDefined()
    await wrapper.get('.run').trigger('click')
    expect(runTests).toHaveBeenCalledTimes(1)
    pending.resolve({ results: [{ name: 'ok', ok: true }] })
    await flushPromises()
    expect(play).not.toHaveBeenCalled()
    expect(wrapper.get('.run').attributes('disabled')).toBeUndefined()
  })

  it('shows tests in a separate file and renders review feedback', async () => {
    const wrapper = render({ review: { summary: 'Use a **constant**.' } })
    await wrapper.findAll('.tabs-file [role="tab"]')[1].trigger('click')
    expect(wrapper.get('.tests-view').text()).toBe(props.exercise.tests)
    expect(wrapper.findAll('.tabs-file [role="tab"]')[1].text()).toContain('main.test.js')
    await wrapper.findAll('.ptabs button')[2].trigger('click')
    expect(wrapper.get('.review strong').text()).toBe('constant')
  })

  it('uses review-only mode for unsupported browser languages', async () => {
    const wrapper = render({ language: 'python', languageLabel: 'Python', exercise: { ...props.exercise, tests: '**Expected cases**', testsStatus: 'unverified' } })
    expect(wrapper.find('.run').exists()).toBe(false)
    expect(wrapper.get('.pbody').text()).toContain('without running them')
    expect(wrapper.text()).toContain('unverified tests')
    await wrapper.findAll('.tabs-file [role="tab"]')[1].trigger('click')
    expect(wrapper.get('.tests-view strong').text()).toBe('Expected cases')
  })

  it('forwards edits and submit events to the owning exercise', async () => {
    const wrapper = render()
    await wrapper.get('textarea').setValue('const changed = 1')
    expect(wrapper.emitted('update:modelValue')).toEqual([['const changed = 1']])
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter', ctrlKey: true })
    expect(wrapper.emitted('submit')).toHaveLength(1)
  })
})
