// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LinearRegression from '../../src/blocks/linear-regression/LinearRegression.vue'
import { buildRegressionModel } from '../../src/blocks/linear-regression/regression.ts'

enableAutoUnmount(afterEach)
let reducedMotion = true
const disconnect = vi.fn()
beforeEach(() => {
  reducedMotion = true
  disconnect.mockClear()
  vi.useFakeTimers()
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect = disconnect })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 16))
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  vi.stubGlobal('matchMedia', () => ({ matches: reducedMotion }))
  vi.stubGlobal('devicePixelRatio', 2)
  vi.spyOn(HTMLCanvasElement.prototype, 'clientWidth', 'get').mockReturnValue(640)
  vi.spyOn(HTMLCanvasElement.prototype, 'clientHeight', 'get').mockReturnValue(320)
  const context = Object.fromEntries(['setTransform', 'clearRect', 'moveTo', 'lineTo', 'beginPath', 'fillText', 'stroke', 'save', 'rect', 'clip', 'setLineDash', 'arc', 'fill', 'restore'].map((method) => [method, vi.fn()]))
  context.measureText = vi.fn().mockReturnValue({ width: 24 })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllTimers(); vi.useRealTimers() })

const config = () => ({ instruction: 'Fit the data.', xLabel: 'x', yLabel: 'y', model: buildRegressionModel([{ x: 0, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 5 }])! })

describe('regression plot controls', () => {
  it('shows predictions, updates them with the slider, and finds a zero-error fit', async () => {
    const wrapper = mount(LinearRegression, { props: { config: config() } })
    await nextTick()
    expect(wrapper.get('canvas').attributes('aria-label')).toContain('Horizontal axis: x. Vertical axis: y.')
    expect(wrapper.get('canvas').element.width).toBe(1280)
    const initial = Number(wrapper.get('output').text())
    await wrapper.findAll('input')[0].setValue('1000')
    expect(Number(wrapper.get('output').text())).not.toBe(initial)
    await wrapper.get('button').trigger('click')
    expect(wrapper.get('output').text()).toBe('0')
    expect(wrapper.findAll('tbody tr').map((row) => row.findAll('td')[2].text())).toEqual(['1', '3', '5'])
    await wrapper.findAll('input')[1].setValue('0')
    expect(Number(wrapper.get('output').text())).toBeGreaterThan(0)
    wrapper.unmount()
    expect(disconnect).toHaveBeenCalledTimes(1)
  })

  it('animates toward the best fit and resets controls when data changes', async () => {
    reducedMotion = false
    const wrapper = mount(LinearRegression, { props: { config: config() } })
    await wrapper.get('button').trigger('click')
    await vi.advanceTimersByTimeAsync(400)
    expect(wrapper.get('output').text()).toBe('0')
    await wrapper.setProps({ config: { ...config(), model: buildRegressionModel([{ x: 0, y: 10 }, { x: 2, y: 20 }])! } })
    expect(Number(wrapper.get('output').text())).toBeGreaterThan(0)
    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
  })
})
