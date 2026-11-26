// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import BlockHost from '../../src/blocks/BlockHost.vue'
import { vueBlock } from '../../src/blocks/vue-block.ts'
import { configureLocale } from '../../src/lib/i18n.ts'
import type { BlockContext, BlockDefinition, BlockProps } from '../../src/blocks/types.ts'

afterEach(() => configureLocale(() => 'en'))

const spec = { version: '1.0.0', engine: '^1.0.0', summary: '', schema: {}, instructions: '' }

/** A block written like an external plugin: plain DOM, everything through ctx. */
function plainBlock(log: string[]): BlockDefinition {
  return {
    ...spec,
    id: 'test/counter',
    locales: { pl: { 'Clicks: {0}': 'Kliknięcia: {0}' } },
    normalize: (data) => data,
    describe: () => '',
    mount(el, props, ctx: BlockContext) {
      let current = props
      const label = document.createElement('p')
      const body = document.createElement('div')
      const button = document.createElement('button')
      button.textContent = 'add'
      button.addEventListener('click', () => ctx.emit('clicked', current.data.count + 1))
      const draw = () => {
        label.textContent = ctx.t('Clicks: {0}', [ctx.formatNumber(current.data.count)])
        ctx.renderMarkdown(body, current.data.note)
      }
      el.append(label, body, button)
      draw()
      log.push('mount')
      return {
        update(next) {
          current = next
          draw()
          log.push('update')
        },
        unmount() {
          el.replaceChildren()
          log.push('unmount')
        },
      }
    },
  }
}

describe('BlockHost', () => {
  it('mounts a framework-agnostic block, updates it and forwards its events', async () => {
    const log: string[] = []
    configureLocale(() => 'pl')
    const props: BlockProps = { data: { count: 1200, note: 'Some **bold** text' }, codeLanguage: 'js' }
    const wrapper = mount(BlockHost, { props: { block: plainBlock(log), blockProps: props } })

    expect(wrapper.text()).toContain('Kliknięcia: 1200')
    expect(wrapper.find('strong').text()).toBe('bold')

    await wrapper.setProps({ blockProps: { ...props, data: { count: 3, note: 'Changed' } } })
    expect(wrapper.text()).toContain('Kliknięcia: 3')
    expect(wrapper.text()).toContain('Changed')

    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('event')).toEqual([['clicked', 4]])

    wrapper.unmount()
    expect(log).toEqual(['mount', 'update', 'unmount'])
  })

  it('keeps the lesson alive when a block fails to mount', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const broken: BlockDefinition = { ...plainBlock([]), mount: () => { throw new Error('boom') } }
    const wrapper = mount(BlockHost, { props: { block: broken, blockProps: { data: {}, codeLanguage: 'js' } } })
    expect(wrapper.html()).toContain('data-block="test/counter"')
    expect(error).toHaveBeenCalled()
    wrapper.unmount()
    error.mockRestore()
  })
})

describe('vueBlock', () => {
  const Probe = defineComponent({
    props: { config: { type: Object, required: true }, step: { type: Number, default: 0 } },
    emits: ['update:modelValue'],
    setup(props, { emit, attrs }) {
      return () => h('button', {
        'data-attrs': Object.keys(attrs).join(','),
        onClick: () => emit('update:modelValue', props.step + 1),
      }, `${props.config.label}:${props.step}`)
    },
  })

  it('passes data as config, only declared host props, and forwards declared events', async () => {
    const el = document.createElement('div')
    const emitted: unknown[][] = []
    const ctx = { emit: (...args: unknown[]) => emitted.push(args) } as unknown as BlockContext
    const instance = vueBlock(Probe)(el, { data: { label: 'A' }, codeLanguage: 'js', step: 2 }, ctx)

    const button = el.querySelector('button')
    expect(button.textContent).toBe('A:2')
    // codeLanguage is not declared, so it must not leak onto the DOM as an attribute.
    expect(button.dataset.attrs).toBe('')

    button.click()
    expect(emitted).toEqual([['update:modelValue', 3]])

    instance.update({ data: { label: 'B' }, codeLanguage: 'js', step: 5 })
    await nextTick()
    expect(el.querySelector('button').textContent).toBe('B:5')

    instance.unmount()
    expect(el.innerHTML).toBe('')
  })
})
