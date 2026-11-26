// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CodeComparison from '../../src/components/exercises/visualizations/CodeComparison.vue'

enableAutoUnmount(afterEach)
afterEach(() => vi.unstubAllGlobals())

const config = { variants: [
  { label: 'Assertion', code: 'const value = "28";\nconsole.log(value + 1);', outcome: 'The value stays a string.' },
  { label: 'Conversion', code: 'const value = Number("28");\nconsole.log(value + 1);', outcome: 'The value becomes a number.' },
] }

describe('code comparison with the tutor', () => {
  it('keeps the tutor explanation and highlighted line synchronized with the current step', async () => {
    const wrapper = mount(CodeComparison, { props: { config, step: { line: 1, say: 'Read the text.' } } })
    expect(wrapper.get('.tutor .say').text()).toBe('Read the text.')
    expect(wrapper.find('.tutor svg').exists()).toBe(true)
    expect(wrapper.get('.ln.active').text()).toContain('const value')
    await wrapper.setProps({ step: { line: 2, say: 'The plus operator joins the text.' } })
    expect(wrapper.get('.tutor .say').text()).toBe('The plus operator joins the text.')
    expect(wrapper.get('.ln.active').text()).toContain('console.log')
    expect(wrapper.text()).not.toContain('Read the text.')
    await wrapper.setProps({ step: { line: 1, say: 'Read the text.' } })
    expect(wrapper.get('.ln.active').text()).toContain('const value')
  })

  it('switches variants and shows their outcome when no step explanation is available', async () => {
    const wrapper = mount(CodeComparison, { props: { config } })
    expect(wrapper.get('.tutor .say').text()).toBe(config.variants[0].outcome)
    await wrapper.findAll('.variants button')[1].trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([1])
    expect(wrapper.get('.listing').text()).toContain('Number')
    expect(wrapper.get('.tutor .say').text()).toBe(config.variants[1].outcome)
    expect(wrapper.findAll('.variants button')[1].attributes('aria-pressed')).toBe('true')
  })

  it('repositions after code layout changes and disconnects its observer on unmount', async () => {
    let resized!: ResizeObserverCallback
    const disconnect = vi.fn()
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) { resized = callback }
      observe() {}
      disconnect = disconnect
    })
    const wrapper = mount(CodeComparison, { props: { config, step: { line: 2, say: 'Watch this line.' } } })
    wrapper.get('.ln.active').element.getBoundingClientRect = () => ({ top: 130 }) as DOMRect
    wrapper.get('.listing').element.getBoundingClientRect = () => ({ top: 30 }) as DOMRect
    resized([], {} as ResizeObserver)
    await wrapper.vm.$nextTick()
    expect(wrapper.get<HTMLElement>('.tutor').element.style.paddingTop).toBe('82px')
    wrapper.unmount()
    expect(disconnect).toHaveBeenCalledOnce()
  })
})
