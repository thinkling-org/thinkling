// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils'
import { createPinia, disposePinia } from 'pinia'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { configureSfx } from '../../src/lib/sfx.ts'
import { useApp } from '../../src/stores/app.ts'
import ReviewView from '../../src/views/ReviewView.vue'

let pinia: ReturnType<typeof createPinia>
let app: ReturnType<typeof useApp>
const scrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView')

enableAutoUnmount(afterEach)

beforeEach(() => {
  pinia = createPinia()
  app = useApp(pinia)
  configureSfx({ sound: false })
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
  vi.setSystemTime(new Date(2026, 0, 1, 12))
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
})

afterEach(() => {
  disposePinia(pinia)
  vi.clearAllTimers()
  vi.useRealTimers()
  configureSfx({ sound: true })
  if (scrollIntoView) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scrollIntoView)
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
})

async function openReview(url = '/review') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/review', component: ReviewView }, { path: '/path', component: { template: '<main />' } }],
  })
  await router.push(url)
  return mount(ReviewView, { global: { plugins: [pinia, router] } })
}

function pressKey(key: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true }))
  return nextTick()
}

describe('ReviewView', () => {
  it('shows how to start a review when the user has no flashcards', async () => {
    const wrapper = await openReview()

    expect(wrapper.get('h1').text()).toBe('No flashcards due')
    expect(wrapper.text()).toContain('Go to the learning path')
    expect(wrapper.text()).not.toContain('Practice the entire deck')
  })

  it('offers the full deck when all scheduled reviews are in the future', async () => {
    app.addFlashcards([{ front: 'A future review', back: 'Answer' }], 'Promises')
    app.flashcards[0].due += 60_000
    const scheduled = await openReview()

    expect(scheduled.get('a[href="/review?all=1"]').text()).toBe('Practice the entire deck')
    scheduled.unmount()

    const all = await openReview('/review?all=1')
    expect(all.text()).toContain('A future review')
  })

  it('requeues missed cards, reveals answers with the keyboard and records finished reviews', async () => {
    app.addFlashcards([
      { front: 'What is pending?', back: 'The work has not settled.' },
      { front: 'What is a rejection?', back: 'A settled failure.' },
    ], 'Promises')
    const wrapper = await openReview()

    expect(wrapper.text()).toContain('What is pending?')
    await pressKey('3')
    expect(wrapper.text()).not.toContain('The work has not settled.')
    await pressKey(' ')
    expect(wrapper.text()).toContain('The work has not settled.')
    await pressKey('1')
    expect(wrapper.text()).toContain('What is a rejection?')

    await wrapper.get('button.btn-block').trigger('click')
    await pressKey('3')
    expect(wrapper.text()).toContain('What is pending?')
    expect(wrapper.text()).toContain('mistakes: 1')
    await pressKey('Enter')
    await pressKey('4')

    expect(wrapper.get('h1').text()).toBe('Review complete!')
    expect(wrapper.text()).toContain('2 / 2')
    expect(wrapper.text()).toContain('Again: 1')
    expect(wrapper.text()).toContain('Good: 1')
    expect(wrapper.text()).toContain('Easy: 1')
    await vi.advanceTimersByTimeAsync(60_000)
    wrapper.unmount()
    expect(app.todayMinutes).toBe(1)
  })
})
