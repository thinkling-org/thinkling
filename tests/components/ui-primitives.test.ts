// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { UiButton, UiCard, UiChip, UiChoiceGroup, UiDialog, UiIconButton, UiInput, UiProgress, UiSpinner, UiTabs, UiTag } from '../../src/components/ui/index.ts'

enableAutoUnmount(afterEach)

const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:any(.*)*', component: { template: '<div />' } }] })

describe('UiButton', () => {
  it('renders a typed button with variant and size classes', () => {
    const wrapper = mount(UiButton, { props: { variant: 'primary', size: 'sm', block: true }, slots: { default: 'Save' } })
    const button = wrapper.get('button')
    expect(button.attributes('type')).toBe('button')
    expect(button.classes()).toEqual(['btn', 'btn-primary', 'btn-sm', 'btn-block'])
    expect(button.text()).toBe('Save')
  })

  it('uses only the base class for the default variant and size', () => {
    expect(mount(UiButton).get('button').classes()).toEqual(['btn'])
  })

  it('renders the link variant without the 3D button class', () => {
    expect(mount(UiButton, { props: { variant: 'link' } }).get('button').classes()).toEqual(['link-btn'])
  })

  it('emits clicks, but not while loading', async () => {
    const wrapper = mount(UiButton)
    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)

    await wrapper.setProps({ loading: true })
    const button = wrapper.get('button')
    expect(button.element.disabled).toBe(true)
    expect(button.attributes('aria-busy')).toBe('true')
    expect(wrapper.findComponent(UiSpinner).exists()).toBe(true)
  })

  it('renders a RouterLink for `to` and an anchor for `href`', async () => {
    const routed = mount(UiButton, { props: { to: '/path' }, global: { plugins: [router] } })
    await router.isReady()
    expect(routed.get('a').attributes('href')).toBe('/path')
    expect(routed.get('a').classes()).toContain('btn')

    const external = mount(UiButton, { props: { href: 'https://example.com' } })
    expect(external.get('a').attributes('href')).toBe('https://example.com')
  })

  it('drops the target of a disabled link and takes it out of the tab order', () => {
    const wrapper = mount(UiButton, { props: { href: '/x', disabled: true } })
    const link = wrapper.get('a')
    expect(link.attributes('href')).toBeUndefined()
    expect(link.attributes('aria-disabled')).toBe('true')
    expect(link.attributes('tabindex')).toBe('-1')
  })
})

describe('UiSpinner', () => {
  it('is decorative without a label and a status with one', () => {
    const decorative = mount(UiSpinner, { props: { size: 'sm' } })
    expect(decorative.attributes('aria-hidden')).toBe('true')
    expect(decorative.classes()).toEqual(['spinner', 'spinner-sm'])

    const announced = mount(UiSpinner, { props: { label: 'Loading' } })
    expect(announced.attributes('role')).toBe('status')
    expect(announced.attributes('aria-label')).toBe('Loading')
    expect(announced.attributes('aria-hidden')).toBeUndefined()
  })
})

describe('UiCard and UiTag', () => {
  it('render the right class and element', () => {
    expect(mount(UiCard, { props: { as: 'section' } }).get('section').classes()).toEqual(['card'])
    expect(mount(UiCard, { props: { dashed: true } }).classes()).toEqual(['card-dashed'])
    expect(mount(UiTag).classes()).toEqual(['tag', 'tag-neutral'])
    expect(mount(UiTag, { props: { tone: 'red' } }).classes()).toEqual(['tag', 'tag-red'])
  })
})

describe('UiChip', () => {
  it('toggles aria-pressed through v-model:pressed', async () => {
    const wrapper = mount(UiChip, {
      props: { pressed: false, 'onUpdate:pressed': (value: boolean) => wrapper.setProps({ pressed: value }) },
    })
    expect(wrapper.attributes('aria-pressed')).toBe('false')
    await wrapper.trigger('click')
    expect(wrapper.emitted('update:pressed')).toEqual([[true]])
    expect(wrapper.attributes('aria-pressed')).toBe('true')
  })

  it('is a plain action button without `pressed`', async () => {
    const wrapper = mount(UiChip)
    expect(wrapper.attributes('aria-pressed')).toBeUndefined()
    expect(wrapper.attributes('type')).toBe('button')
    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)
    expect(wrapper.emitted('update:pressed')).toBeUndefined()
  })
})

describe('UiInput', () => {
  it('binds v-model on an input and passes attributes through', async () => {
    const wrapper = mount(UiInput, { props: { modelValue: 'a', placeholder: 'Name' } })
    const input = wrapper.get('input')
    expect(input.classes()).toEqual(['input'])
    expect(input.attributes('placeholder')).toBe('Name')
    await input.setValue('abc')
    expect(wrapper.emitted('update:modelValue')).toEqual([['abc']])
  })

  it('renders a textarea when multiline', () => {
    const wrapper = mount(UiInput, { props: { multiline: true, rows: 4 } })
    expect(wrapper.get('textarea').classes()).toEqual(['field'])
    expect(wrapper.get('textarea').attributes('rows')).toBe('4')
  })
})

describe('UiProgress', () => {
  it('exposes progress to assistive tech and clamps the bar width', async () => {
    const wrapper = mount(UiProgress, { props: { value: 3, max: 4, label: 'Lesson progress' } })
    expect(wrapper.attributes('role')).toBe('progressbar')
    expect(wrapper.attributes('aria-valuenow')).toBe('3')
    expect(wrapper.attributes('aria-label')).toBe('Lesson progress')
    expect((wrapper.element.firstElementChild as HTMLElement).style.width).toBe('75%')

    await wrapper.setProps({ value: 9 })
    expect((wrapper.element.firstElementChild as HTMLElement).style.width).toBe('100%')
    await wrapper.setProps({ max: 0 })
    expect((wrapper.element.firstElementChild as HTMLElement).style.width).toBe('0%')
  })
})

describe('UiDialog', () => {
  const native = {
    showModal: Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal'),
    close: Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close'),
  }
  beforeEach(() => {
    // jsdom has no top layer; the Electron smoke test covers real modality and focus.
    Object.defineProperties(HTMLDialogElement.prototype, {
      showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', '') } },
      close: { configurable: true, value: function (this: HTMLDialogElement) {
        this.removeAttribute('open')
        this.dispatchEvent(new Event('close'))
      } },
    })
  })
  afterEach(() => {
    for (const key of ['showModal', 'close'] as const) {
      if (native[key]) Object.defineProperty(HTMLDialogElement.prototype, key, native[key])
      else Reflect.deleteProperty(HTMLDialogElement.prototype, key)
    }
  })

  function render(open: boolean) {
    const wrapper = mount(UiDialog, {
      props: { open, title: 'Delete?', description: 'This cannot be undone.', 'onUpdate:open': (value: boolean) => wrapper.setProps({ open: value }) },
      slots: { default: '<p class="body">Body</p>', actions: '<button class="ok">OK</button>' },
    })
    return wrapper
  }

  it('labels the dialog with its title and description', () => {
    const dialog = render(false).get('dialog')
    const title = dialog.get('h2')
    expect(title.text()).toBe('Delete?')
    expect(dialog.attributes('aria-labelledby')).toBe(title.attributes('id'))
    expect(dialog.get(`#${dialog.attributes('aria-describedby')}`).text()).toBe('This cannot be undone.')
    expect(dialog.find('.body').exists()).toBe(true)
    expect(dialog.find('.ui-dialog-actions .ok').exists()).toBe(true)
  })

  it('opens and closes with the open prop', async () => {
    const wrapper = render(false)
    expect(wrapper.get('dialog').element.open).toBe(false)
    await wrapper.setProps({ open: true })
    expect(wrapper.get('dialog').element.open).toBe(true)
    await wrapper.setProps({ open: false })
    expect(wrapper.get('dialog').element.open).toBe(false)
    expect(wrapper.emitted('update:open')).toBeUndefined()
  })

  it('reports Escape (cancel) as closed exactly once', async () => {
    const wrapper = render(true)
    await wrapper.vm.$nextTick()
    await wrapper.get('dialog').trigger('cancel')
    await wrapper.get('dialog').trigger('close')
    expect(wrapper.emitted('update:open')).toEqual([[false]])
    expect(wrapper.get('dialog').element.open).toBe(false)
  })
})

describe('UiChoiceGroup', () => {
  const options = [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Beta', disabled: true },
    { value: 'c', label: 'Gamma', title: 'Third' },
  ]
  function render(props: Record<string, unknown>) {
    const wrapper = mount(UiChoiceGroup, {
      attachTo: document.body,
      // Generic SFC props are hard to spell in a test; the component's own types are checked by vue-tsc.
      props: { options, label: 'Pick', ...props, 'onUpdate:modelValue': (value: unknown) => wrapper.setProps({ modelValue: value as never }) } as never,
    })
    return wrapper
  }

  it('is a labelled radio group with one tab stop on the selected option', () => {
    const wrapper = render({ modelValue: 'c' })
    expect(wrapper.attributes('role')).toBe('radiogroup')
    expect(wrapper.attributes('aria-label')).toBe('Pick')
    const radios = wrapper.findAll('[role="radio"]')
    expect(radios.map((r) => r.attributes('aria-checked'))).toEqual(['false', 'false', 'true'])
    expect(radios.map((r) => r.attributes('tabindex'))).toEqual(['-1', '-1', '0'])
    expect((radios[1].element as HTMLButtonElement).disabled).toBe(true)
    expect(radios[2].attributes('title')).toBe('Third')
  })

  it('selects on click and moves with arrow keys, skipping disabled options', async () => {
    const wrapper = render({ modelValue: 'a' })
    const radios = wrapper.findAll('[role="radio"]')
    await radios[0].trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.props('modelValue')).toBe('c')
    expect(document.activeElement).toBe(radios[2].element)
    await radios[2].trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.props('modelValue')).toBe('a')
    await radios[0].trigger('keydown', { key: 'End' })
    expect(wrapper.props('modelValue')).toBe('c')
    await radios[2].trigger('click')
    expect(wrapper.emitted('select')?.at(-1)).toEqual(['c'])
  })

  it('makes the first enabled option reachable when nothing is selected', () => {
    const wrapper = render({ modelValue: 'custom', options: [{ value: 'x', label: 'X', disabled: true }, ...options] })
    expect(wrapper.findAll('[role="radio"]').map((r) => r.attributes('tabindex'))).toEqual(['-1', '0', '-1', '-1'])
  })

  it('toggles values in an array with `multiple`', async () => {
    const wrapper = render({ modelValue: ['a'], multiple: true })
    expect(wrapper.attributes('role')).toBe('group')
    const chips = wrapper.findAll('button')
    expect(chips[0].attributes('aria-pressed')).toBe('true')
    expect(chips[0].attributes('role')).toBeUndefined()
    await chips[2].trigger('click')
    expect(wrapper.props('modelValue')).toEqual(['a', 'c'])
    await chips[0].trigger('click')
    expect(wrapper.props('modelValue')).toEqual(['c'])
  })
})

describe('UiIconButton', () => {
  it('names the button with its label and renders the icon', () => {
    const wrapper = mount(UiIconButton, { props: { label: 'Close', icon: 'x', size: 'lg', variant: 'outlined' } })
    const button = wrapper.get('button')
    expect(button.attributes('aria-label')).toBe('Close')
    expect(button.attributes('title')).toBe('Close')
    expect(button.attributes('type')).toBe('button')
    expect(button.classes()).toEqual(['icon-btn', 'icon-btn-lg', 'icon-btn-outlined'])
    expect(button.find('svg').exists()).toBe(true)
  })

  it('exposes focus()', () => {
    const wrapper = mount(UiIconButton, { attachTo: document.body, props: { label: 'Add' }, slots: { default: '+' } })
    const exposed = wrapper.vm as unknown as { focus(): void }
    exposed.focus()
    expect(document.activeElement).toBe(wrapper.element)
  })
})

describe('UiTabs', () => {
  const tabs = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }, { value: 'c', label: 'C' }]
  function render(props: Record<string, unknown> = {}) {
    const wrapper = mount(UiTabs, {
      attachTo: document.body,
      props: { tabs, modelValue: 'b', label: 'Files', ...props, 'onUpdate:modelValue': (value: unknown) => wrapper.setProps({ modelValue: value as never }) } as never,
      slots: { end: '<button class="extra">Run</button>' },
    })
    return wrapper
  }

  it('renders a labelled tablist with the selected tab as the only tab stop', () => {
    const wrapper = render()
    const list = wrapper.get('[role="tablist"]')
    expect(list.attributes('aria-label')).toBe('Files')
    const items = list.findAll('[role="tab"]')
    expect(items.map((tab) => tab.attributes('aria-selected'))).toEqual(['false', 'true', 'false'])
    expect(items.map((tab) => tab.attributes('tabindex'))).toEqual(['-1', '0', '-1'])
    // Extra controls sit outside the tablist.
    expect(list.find('.extra').exists()).toBe(false)
    expect(wrapper.find('.extra').exists()).toBe(true)
  })

  it('activates tabs with click, arrows, Home and End', async () => {
    const wrapper = render()
    const items = () => wrapper.findAll('[role="tab"]')
    await items()[0].trigger('click')
    expect(wrapper.props('modelValue')).toBe('a')
    await items()[0].trigger('keydown', { key: 'ArrowLeft' })
    expect(wrapper.props('modelValue')).toBe('c')
    expect(document.activeElement).toBe(items()[2].element)
    await items()[2].trigger('keydown', { key: 'Home' })
    expect(wrapper.props('modelValue')).toBe('a')
    await items()[0].trigger('keydown', { key: 'End' })
    expect(wrapper.props('modelValue')).toBe('c')
  })

  it('closes tabs with Delete, middle click or the close control when closable', async () => {
    const wrapper = render({ closable: true, closeLabel: (tab: { label: string }) => `Close ${tab.label}` })
    const items = wrapper.findAll('[role="tab"]')
    expect(items[1].attributes('aria-keyshortcuts')).toBe('Delete')
    await items[1].trigger('keydown', { key: 'Delete' })
    await items[2].trigger('auxclick', { button: 1 })
    const close = wrapper.findAll('.tab-close')
    expect(close[0].attributes('tabindex')).toBe('-1')
    expect(close[0].attributes('title')).toBe('Close A')
    await close[0].trigger('click')
    expect(wrapper.emitted('close')).toEqual([['b'], ['c'], ['a']])
  })

  it('has no close controls unless closable', async () => {
    const wrapper = render()
    expect(wrapper.find('.tab-close').exists()).toBe(false)
    await wrapper.findAll('[role="tab"]')[0].trigger('keydown', { key: 'Delete' })
    expect(wrapper.emitted('close')).toBeUndefined()
  })
})
