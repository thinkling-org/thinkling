// The app's implementation of BlockContext. Blocks never import these components directly
// through the public API; built-in blocks may, external plugins cannot.
import { h, render } from 'vue'
import type { Component } from 'vue'
import CodeBlock from '../components/CodeBlock.vue'
import Icon from '../components/Icon.vue'
import Markdown from '../components/Markdown.vue'
import { createTranslator, uiLocale } from '../lib/i18n.ts'
import type { BlockContext, BlockDefinition, Dispose } from './types.ts'

function renderInto(el: HTMLElement, component: Component, props: Record<string, unknown>): Dispose {
  render(h(component, props), el)
  return () => render(null, el)
}

export function createBlockContext(block: BlockDefinition, emit: (event: string, payload?: unknown) => void): BlockContext {
  return {
    get locale() {
      return uiLocale()
    },
    t: createTranslator(block.locales ?? {}),
    formatNumber: (value, options) => new Intl.NumberFormat(uiLocale(), options).format(value),
    renderMarkdown: (el, source, options) => renderInto(el, Markdown, { src: source, inline: !!options?.inline }),
    renderCode: (el, { code, language, fileName }) => renderInto(el, CodeBlock, { code, language, fileName }),
    renderIcon: (el, name, options) => renderInto(el, Icon, { name, ...(options?.size && { size: options.size }) }),
    answer: (value, options) => emit('answer', { value, complete: options?.complete !== false }),
    emit,
  }
}
