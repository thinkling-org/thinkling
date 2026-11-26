// @vitest-environment jsdom

import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SandboxIDE from '../../src/components/SandboxIDE.vue'
import { sandbox } from '../../src/lib/sandbox.ts'

vi.mock('../../src/lib/sandbox.ts', () => ({ sandbox: {
  open: vi.fn(), files: vi.fn(), read: vi.fn(), create: vi.fn(), write: vi.fn(),
} }))
vi.mock('../../src/components/CodeEditor.vue', () => ({ default: {
  props: ['fileName', 'modelValue'], template: '<textarea :aria-label="fileName" :value="modelValue" />',
} }))
vi.mock('../../src/components/Terminal.vue', () => ({ default: { template: '<div />' } }))

enableAutoUnmount(afterEach)
afterEach(() => vi.restoreAllMocks())

const starter = { path: 'main.go', dir: false, mtime: 1, size: 12 }
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(sandbox.open).mockResolvedValue({ env: 'Go', files: [starter] })
  vi.mocked(sandbox.files).mockResolvedValue([starter])
  vi.mocked(sandbox.read).mockImplementation(async (_ws, path) => ({ content: path === 'main.go' ? 'package main' : '', mtime: 1 }))
  vi.mocked(sandbox.create).mockResolvedValue({ mtime: 1 })
  // Electron throws here; file creation must never rely on this browser API.
  vi.spyOn(window, 'prompt').mockImplementation(() => { throw new Error('prompt() is and will not be supported.') })
})

async function render() {
  const wrapper = mount(SandboxIDE, {
    props: { wsId: 'lesson', language: 'go', mainFile: 'main.go' }, attachTo: document.body,
  })
  await flushPromises()
  await wrapper.get('button[aria-label="New file"]').trigger('click')
  return wrapper
}

describe('creating files in the sandbox editor', () => {
  it('focuses the form and creates, lists and opens a nested file without using prompt', async () => {
    const wrapper = await render()
    const input = wrapper.get<HTMLInputElement>('.new-file input')
    expect(document.activeElement).toBe(input.element)
    await input.setValue(' src/helper.go ')
    vi.mocked(sandbox.files).mockResolvedValue([starter, { path: 'src/helper.go', dir: false, mtime: 1, size: 0 }])
    await wrapper.get('.new-file').trigger('submit')
    await flushPromises()
    expect(window.prompt).not.toHaveBeenCalled()
    expect(sandbox.create).toHaveBeenCalledExactlyOnceWith('lesson', 'src/helper.go')
    expect(sandbox.write).not.toHaveBeenCalled()
    expect(wrapper.find('.new-file').exists()).toBe(false)
    expect(wrapper.get('.node.on').attributes('title')).toBe('src/helper.go')
    expect(wrapper.get('textarea').attributes('aria-label')).toBe('src/helper.go')
    expect(wrapper.get('textarea').element.value).toBe('')
  })

  it('retains the name and existing editor contents when creation fails, then permits a retry', async () => {
    const wrapper = await render()
    await wrapper.get('.new-file input').setValue('main.go')
    vi.mocked(sandbox.create).mockRejectedValueOnce(new Error('A file or folder already exists at this path'))
    await wrapper.get('.new-file').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe('A file or folder already exists at this path')
    expect(wrapper.get<HTMLInputElement>('.new-file input').element.value).toBe('main.go')
    expect(wrapper.get('textarea').element.value).toBe('package main')
    await wrapper.get('.new-file input').setValue('other.go')
    await wrapper.get('.new-file').trigger('submit')
    await flushPromises()
    expect(wrapper.find('.new-file').exists()).toBe(false)
    expect(sandbox.create).toHaveBeenLastCalledWith('lesson', 'other.go')
  })

  it('cancels with Escape or the cancel button and never submits a blank name', async () => {
    const wrapper = await render()
    expect(wrapper.get<HTMLButtonElement>('.new-file button[type="submit"]').element.disabled).toBe(true)
    await wrapper.get('.new-file').trigger('submit')
    await wrapper.get('.new-file input').setValue('discard.go')
    await wrapper.get('.new-file input').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('.new-file').exists()).toBe(false)
    expect(document.activeElement).toBe(wrapper.get('button[aria-label="New file"]').element)
    await wrapper.get('button[aria-label="New file"]').trigger('click')
    expect(wrapper.get<HTMLInputElement>('.new-file input').element.value).toBe('')
    await wrapper.get('.new-file button[type="button"]').trigger('click')
    expect(wrapper.find('.new-file').exists()).toBe(false)
    expect(sandbox.create).not.toHaveBeenCalled()
  })

  it('prevents duplicate submissions while the create request is pending', async () => {
    const wrapper = await render()
    let finish!: (value: { mtime: number }) => void
    vi.mocked(sandbox.create).mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
    await wrapper.get('.new-file input').setValue('new.go')
    await wrapper.get('.new-file').trigger('submit')
    await wrapper.get('.new-file').trigger('submit')
    expect(sandbox.create).toHaveBeenCalledTimes(1)
    expect(wrapper.get<HTMLInputElement>('.new-file input').element.disabled).toBe(true)
    finish({ mtime: 1 })
    await flushPromises()
    expect(wrapper.find('.new-file').exists()).toBe(false)
  })
})
