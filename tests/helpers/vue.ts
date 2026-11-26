import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'

/** Run a composable with a real Vue lifetime, including mount and cleanup hooks. */
export function mountComposable<T>(setup: () => T) {
  let result!: T
  const wrapper = mount(defineComponent({
    setup() { result = setup(); return () => null },
  }))
  return { result, wrapper }
}

export function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
