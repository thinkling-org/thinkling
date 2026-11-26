// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GlossaryPopover from '../../src/components/GlossaryPopover.vue'
import { activeTerm, closeCodeDefinitionSoon, keepCodeDefinitionOpen } from '../../src/lib/glossary.ts'

let wrapper: VueWrapper | undefined
beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 20, top: 30, right: 220, bottom: 60, width: 200, height: 30 } as DOMRect)
})
afterEach(async () => {
  activeTerm.value = null
  await flushPromises()
  wrapper?.unmount()
  keepCodeDefinitionOpen(); vi.restoreAllMocks(); vi.clearAllTimers(); vi.useRealTimers(); document.body.replaceChildren()
})

async function render(code = false) {
  wrapper = mount(GlossaryPopover)
  const term = document.createElement('button')
  term.className = code ? 'code-term' : 'glossary-term'
  term.dataset.glossaryTerm = code ? 'python:print' : 'closure'
  document.body.append(term)
  activeTerm.value = term
  await flushPromises()
  return { wrapper, term, panel: document.querySelector<HTMLElement>('.glossary-panel')! }
}

describe('glossary definition popover', () => {
  it('shows the definition and connects it to its trigger for assistive technology', async () => {
    const { term, panel } = await render()
    expect(panel.textContent).toContain('Closure')
    expect(panel.textContent).toContain('retains access')
    expect(term.getAttribute('aria-expanded')).toBe('true')
    expect(term.getAttribute('aria-controls')).toBe(panel.id)
    expect(panel.style.left).toBe('20px')
    expect(panel.style.top).toBe('68px')
  })

  it.each(['escape', 'outside', 'resize', 'scroll'])('closes on %s and clears accessibility references', async (event) => {
    const { term } = await render(true)
    expect(term.hasAttribute('aria-describedby')).toBe(true)
    if (event === 'escape') document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    else if (event === 'outside') document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    else window.dispatchEvent(new Event(event))
    await flushPromises()
    expect(document.querySelector('.glossary-panel')).toBeNull()
    expect(term.getAttribute('aria-expanded')).toBe('false')
    expect(term.hasAttribute('aria-controls')).toBe(false)
    expect(term.hasAttribute('aria-describedby')).toBe(false)
  })

  it('keeps the panel open for clicks inside and while hovering over the definition', async () => {
    const { term, panel } = await render(true)
    panel.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    closeCodeDefinitionSoon(term)
    panel.dispatchEvent(new Event('pointerenter'))
    await vi.advanceTimersByTimeAsync(250)
    expect(activeTerm.value).toBe(term)
    panel.dispatchEvent(new Event('pointerleave'))
    await vi.advanceTimersByTimeAsync(200)
    expect(activeTerm.value).toBeNull()
  })

  it('places the definition above a trigger near the viewport bottom', async () => {
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockReturnValue({ left: 20, top: 750, right: 220, bottom: 780, width: 200, height: 100 } as DOMRect)
    const { panel } = await render()
    expect(panel.style.top).toBe('642px')
  })
})
