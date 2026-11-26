// @vitest-environment jsdom

import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SandboxIDE from '../../src/components/SandboxIDE.vue'
import { sandbox } from '../../src/lib/sandbox.ts'

const { terminalRun } = vi.hoisted(() => ({ terminalRun: vi.fn() }))
vi.mock('../../src/lib/sandbox.ts', () => ({ sandbox: { open: vi.fn(), files: vi.fn(), read: vi.fn(), create: vi.fn(), write: vi.fn(), run: vi.fn() } }))
vi.mock('../../src/lib/sfx.ts', () => ({ play: vi.fn(), prepareSfx: vi.fn() }))
vi.mock('../../src/components/CodeEditor.vue', () => ({ default: {
  props: ['modelValue', 'issues'], emits: ['update:modelValue', 'apply', 'dismiss', 'save', 'cursor'],
  template: '<div><textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)"/><button class="apply-issue" @click="$emit(\'apply\', 0)">Apply issue</button></div>',
} }))
vi.mock('../../src/components/Terminal.vue', () => ({ default: { setup(_props, { expose }) { expose({ run: terminalRun }); return () => null } } }))
enableAutoUnmount(afterEach)
const files = [{ path: 'main.py', dir: false, size: 10, mtime: 1 }, { path: 'tests/test.py', dir: false, size: 10, mtime: 1 }]
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers()
  vi.stubGlobal('confirm', vi.fn().mockReturnValue(false))
  localStorage.clear()
  vi.mocked(sandbox.open).mockResolvedValue({ env: 'Python', files })
  vi.mocked(sandbox.files).mockResolvedValue(files)
  vi.mocked(sandbox.read).mockResolvedValue({ content: 'original', mtime: 1 })
  vi.mocked(sandbox.write).mockResolvedValue({ mtime: 2 })
  vi.mocked(sandbox.run).mockResolvedValue({ results: [{ name: 'answer', ok: true }], output: 'passed' })
})
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllTimers(); vi.useRealTimers() })
async function render(extra = {}) {
  const wrapper = mount(SandboxIDE, { props: { wsId: 'lesson', language: 'python', mainFile: 'main.py', testCommand: 'pytest', testPaths: ['tests/test.py'], ...extra } })
  await flushPromises()
  return wrapper
}

describe('sandbox IDE actions', () => {
  it('saves pending edits before running tests and shows their output', async () => {
    const wrapper = await render()
    await wrapper.get('textarea').setValue('latest work')
    await wrapper.get('.run').trigger('click'); await flushPromises()
    expect(sandbox.write).toHaveBeenCalledWith('lesson', 'main.py', 'latest work')
    expect(sandbox.run).toHaveBeenCalledWith('lesson', 'pytest', { parse: true })
    expect(vi.mocked(sandbox.write).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(sandbox.run).mock.invocationCallOrder[0])
    expect(wrapper.get('.list').text()).toContain('answer')
    expect(wrapper.get('.rawd pre').text()).toBe('passed')
    expect(wrapper.emitted('run')).toEqual([[{ results: [{ name: 'answer', ok: true }], output: 'passed' }]])
  })

  it('reports execution errors and permits another run', async () => {
    vi.mocked(sandbox.run).mockRejectedValueOnce(new Error('Container stopped'))
    const wrapper = await render()
    await wrapper.get('.run').trigger('click'); await flushPromises()
    expect(wrapper.get('.raw').text()).toBe('Container stopped')
    await wrapper.get('.run').trigger('click'); await flushPromises()
    expect(wrapper.get('.list').text()).toContain('answer')
  })

  it('sends commands to the terminal after saving and switching panels', async () => {
    const wrapper = await render()
    await wrapper.get('[title="Enter the test command in the terminal"]').trigger('click')
    await flushPromises(); await vi.advanceTimersByTimeAsync(50)
    expect(terminalRun).toHaveBeenCalledWith('pytest')
  })

  it('restores starter files only after confirmation', async () => {
    const wrapper = await render()
    await wrapper.get('[title="Restore starter files"]').trigger('click')
    expect(sandbox.open).toHaveBeenCalledTimes(1)
    vi.mocked(confirm).mockReturnValue(true)
    await wrapper.get('[title="Restore starter files"]').trigger('click'); await flushPromises()
    expect(sandbox.open).toHaveBeenLastCalledWith('lesson', 'python', [], expect.objectContaining({ reset: true }))
  })

  it('removes only the issue selected in the current file and displays review feedback', async () => {
    const issues = [{ file: 'other.py', line: 1, severity: 'error', message: 'Other' }, { file: 'main.py', line: 1, severity: 'warning', message: 'Current' }]
    const wrapper = await render({ issues, review: { summary: 'Use **descriptive names**.' } })
    await wrapper.get('.apply-issue').trigger('click')
    expect(wrapper.emitted('update:issues')).toEqual([[[issues[0]]]])
    await wrapper.findAll('.ptabs [role="tab"]')[2].trigger('click')
    expect(wrapper.get('.review strong').text()).toBe('descriptive names')
  })

  it('resizes the output panel within bounds and persists the height', async () => {
    const wrapper = await render()
    await wrapper.get('.drag').trigger('mousedown', { clientY: 500 })
    window.dispatchEvent(new MouseEvent('mousemove', { clientY: 1000 }))
    await flushPromises()
    expect(wrapper.get('.panel').attributes('style')).toContain('height: 110px')
    window.dispatchEvent(new MouseEvent('mouseup'))
    expect(localStorage.getItem('dl-panel-h')).toBe('110')
  })
})
