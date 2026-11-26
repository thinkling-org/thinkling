// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CodeEditor from '../../src/components/CodeEditor.vue'
import type { CodeIssue } from '../../src/domain.ts'

// Monaco is an external browser adapter. Keep its model and callbacks functional
// so the tests exercise the component's edits, annotations and lifetime.
const adapter = vi.hoisted(() => ({
  existing: null as any, model: null as any, editor: null as any,
  contentChanged: null as (() => void) | null,
  cursorChanged: null as ((event: any) => void) | null,
  layoutChanged: null as (() => void) | null,
  commands: new Map<number, () => void>(),
  ensureTheme: vi.fn(), createModel: vi.fn(),
}))
vi.mock('../../src/lib/monaco.ts', () => ({
  ensureTheme: adapter.ensureTheme,
  monacoLanguage: (language: string) => language,
  monaco: {
    Uri: { parse: (uri: string) => uri },
    KeyMod: { CtrlCmd: 2048 }, KeyCode: { Enter: 3, KeyS: 49 },
    Range: class { constructor(public startLineNumber, public startColumn, public endLineNumber, public endColumn) {} },
    editor: {
      OverviewRulerLane: { Right: 4 }, getModel: () => adapter.existing,
      createModel: (...args: unknown[]) => adapter.createModel(...args),
      create: (el: HTMLElement, { model }) => {
        adapter.model = model
        const widgets = new Set<any>()
        const editor = {
          getValue: () => model.getValue(),
          createDecorationsCollection: () => ({ set: vi.fn() }),
          onDidChangeModelContent: (callback) => { adapter.contentChanged = callback },
          onDidChangeCursorPosition: (callback) => { adapter.cursorChanged = callback },
          onDidLayoutChange: (callback) => { adapter.layoutChanged = callback },
          addCommand: (key, callback) => adapter.commands.set(key, callback),
          focus: vi.fn(), updateOptions: vi.fn(), pushUndoStop: vi.fn(),
          executeEdits: vi.fn((_source, edits) => {
            for (const edit of edits) {
              if (edit.range.full) model.setValue(edit.text)
              else {
                const lines = model.getValue().split('\n')
                lines[edit.range.startLineNumber - 1] = edit.text
                model.setValue(lines.join('\n'))
              }
            }
          }),
          getLayoutInfo: () => ({ contentWidth: 500, verticalScrollbarWidth: 10, contentLeft: 30 }),
          changeViewZones: (callback) => callback({ addZone: (zone) => { zone.onDomNodeTop(100); return 'zone' }, removeZone: vi.fn() }),
          addOverlayWidget: (widget) => { widgets.add(widget); widget.getId(); widget.getPosition(); el.append(widget.getDomNode()) },
          removeOverlayWidget: (widget) => { widgets.delete(widget); widget.getDomNode().remove() },
          dispose: vi.fn(() => { for (const widget of widgets) widget.getDomNode().remove() }),
        }
        adapter.editor = editor
        return editor
      },
    },
  },
}))

function model(initial = '') {
  let value = initial
  return {
    getValue: () => value,
    setValue: vi.fn((next: string) => { value = next; adapter.contentChanged?.() }),
    getFullModelRange: () => ({ full: true }),
    getLineCount: () => value.split('\n').length,
    getLineMaxColumn: (line: number) => value.split('\n')[line - 1].length + 1,
    dispose: vi.fn(),
  }
}

enableAutoUnmount(afterEach)
beforeEach(() => {
  vi.clearAllMocks()
  adapter.existing = null; adapter.model = null; adapter.editor = null
  adapter.contentChanged = null; adapter.cursorChanged = null; adapter.layoutChanged = null; adapter.commands.clear()
  adapter.createModel.mockImplementation((value) => model(value))
})

const issue: CodeIssue = { line: 2, severity: 'error', message: 'Return **the value**, not a string. <img onerror="bad()">', replacement: 'return 42;\n' }

describe('code editor binding and feedback', () => {
  it('creates a model, forwards learner edits and applies external updates without echoing them', async () => {
    const wrapper = mount(CodeEditor, { props: { modelValue: 'original', fileName: 'main.js', uid: 'lesson' } })
    expect(adapter.ensureTheme).toHaveBeenCalled()
    expect(adapter.createModel).toHaveBeenCalledWith('original', 'javascript', 'file:///thinkling/lesson/main.js')
    adapter.model.setValue('typed by learner')
    expect(wrapper.emitted('update:modelValue')).toEqual([['typed by learner']])
    await wrapper.setProps({ modelValue: 'external update' })
    expect(adapter.editor.getValue()).toBe('external update')
    expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
    expect(adapter.editor.pushUndoStop).toHaveBeenCalledTimes(1)
    await wrapper.setProps({ modelValue: 'external update' })
    expect(adapter.editor.executeEdits).toHaveBeenCalledTimes(1)
  })

  it('forwards cursor position, submit/save shortcuts and readonly changes', async () => {
    const wrapper = mount(CodeEditor)
    adapter.cursorChanged!({ position: { lineNumber: 2, column: 5 } })
    adapter.commands.get(2048 | 3)!(); adapter.commands.get(2048 | 49)!()
    expect(wrapper.emitted('cursor')).toEqual([[{ line: 2, col: 5 }]])
    expect(wrapper.emitted('submit')).toHaveLength(1)
    expect(wrapper.emitted('save')).toHaveLength(1)
    await wrapper.setProps({ readOnly: true })
    expect(adapter.editor.updateOptions).toHaveBeenCalledWith({ readOnly: true })
  })

  it('renders sanitized feedback and applies a replacement to the indicated line', async () => {
    const wrapper = mount(CodeEditor, { props: { modelValue: 'function answer() {\nreturn "42";\n}', issues: [issue], providerName: 'Tutor' } })
    expect(wrapper.get('.dl-zone-text b').text()).toBe('Tutor:')
    expect(wrapper.get('.dl-zone-text strong').text()).toBe('the value')
    expect(wrapper.find('[onerror]').exists()).toBe(false)
    await wrapper.get('.dl-zone-apply').trigger('click')
    expect(adapter.model.getValue()).toBe('function answer() {\nreturn 42;\n}')
    expect(wrapper.emitted('apply')).toEqual([[0]])
    expect(wrapper.emitted('update:modelValue')).toEqual([['function answer() {\nreturn 42;\n}']])
    await wrapper.get('.dl-zone-dismiss').trigger('click')
    expect(wrapper.emitted('dismiss')).toEqual([[0]])
  })

  it('clamps out-of-range feedback lines and refreshes feedback after layout changes', async () => {
    const wrapper = mount(CodeEditor, { props: { modelValue: 'original', issues: [{ ...issue, line: 999 }] } })
    await wrapper.get('.dl-zone-apply').trigger('click')
    expect(adapter.model.getValue()).toBe('return 42;')
    adapter.layoutChanged!()
    expect(wrapper.findAll('.dl-zone')).toHaveLength(1)
    await wrapper.setProps({ issues: [{ ...issue, line: -1, replacement: '', severity: 'info' }] })
    expect(wrapper.find('.dl-zone-apply').exists()).toBe(false)
    expect(wrapper.get('.dl-zone-dismiss').text()).toBe('OK')
  })

  it('hides replacement actions in readonly mode', () => {
    const wrapper = mount(CodeEditor, { props: { modelValue: 'original', issues: [issue], readOnly: true } })
    expect(wrapper.find('.dl-zone-apply').exists()).toBe(false)
    expect(wrapper.get('.dl-zone-dismiss').text()).toBe("I'll fix it myself")
  })

  it('preserves a retained Monaco model and its undo history across tab mounts', () => {
    const existing = model('old content')
    adapter.existing = existing
    const wrapper = mount(CodeEditor, { props: { modelValue: 'current content', keepModel: true } })
    expect(adapter.createModel).not.toHaveBeenCalled()
    expect(existing.getValue()).toBe('current content')
    wrapper.unmount()
    expect(adapter.editor.dispose).toHaveBeenCalledTimes(1)
    expect(existing.dispose).not.toHaveBeenCalled()
  })

  it('disposes a replaced model and releases temporary models and annotations on unmount', () => {
    const existing = model('old')
    adapter.existing = existing
    const wrapper = mount(CodeEditor, { props: { modelValue: 'new', issues: [issue] } })
    expect(existing.dispose).toHaveBeenCalledTimes(1)
    wrapper.unmount()
    expect(adapter.model.dispose).toHaveBeenCalledTimes(1)
    expect(adapter.editor.dispose).toHaveBeenCalledTimes(1)
    expect(wrapper.element.querySelector('.dl-zone')).toBeNull()
  })
})
