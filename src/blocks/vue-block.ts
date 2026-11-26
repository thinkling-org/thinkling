// Adapter that exposes a Vue component through the framework-agnostic mount() API.
// Each mounted block is its own small Vue app, so blocks do not share the host's app
// instance, plugins or provide/inject. Module-level state (e.g. the glossary) is shared.
import { camelize, createApp, h, shallowReactive, toHandlerKey } from 'vue'
import type { Component, InjectionKey } from 'vue'
import type { BlockContext, BlockModule, BlockProps } from './types.ts'

/** Lets a Vue block reach its context with inject(BLOCK_CONTEXT). */
export const BLOCK_CONTEXT: InjectionKey<BlockContext> = Symbol('thinkling-block-context')

function declaredProps(component: any): string[] {
  const props = component.props
  if (!props) return []
  return Array.isArray(props) ? props : Object.keys(props)
}

function declaredEmits(component: any): string[] {
  const emits = component.emits
  if (!emits) return []
  return Array.isArray(emits) ? emits : Object.keys(emits)
}

/**
 * Mount a Vue component as a block. `data` is passed as the `config` prop; the other
 * host props are passed only when the component declares them. Declared events are
 * forwarded to the host through ctx.emit.
 */
export function vueBlock(component: Component): BlockModule['mount'] {
  const accepted = new Set(declaredProps(component))
  const toComponentProps = ({ data, ...rest }: BlockProps) => ({
    config: data,
    ...Object.fromEntries(Object.entries(rest).filter(([key]) => accepted.has(key))),
  })

  return (el, props, ctx) => {
    const state = shallowReactive(toComponentProps(props))
    const listeners = Object.fromEntries(declaredEmits(component)
      .map((event) => [toHandlerKey(camelize(event)), (payload: unknown) => ctx.emit(event, payload)]))
    const app = createApp({ name: 'BlockRoot', render: () => h(component, { ...state, ...listeners }) })
    app.provide(BLOCK_CONTEXT, ctx)
    app.mount(el)
    return {
      update(next) {
        const nextProps = toComponentProps(next)
        for (const key of Object.keys(state)) if (!(key in nextProps)) delete state[key]
        Object.assign(state, nextProps)
      },
      unmount() {
        app.unmount()
      },
    }
  }
}
