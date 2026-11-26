// @vitest-environment jsdom

import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Dictation from '../../src/components/Dictation.vue'
import { deferred } from '../helpers/vue.ts'

enableAutoUnmount(afterEach)
const stopTrack = vi.fn()
const getUserMedia = vi.fn()
const fetchMock = vi.fn<typeof fetch>()
const stream = { getTracks: () => [{ stop: stopTrack }] }

class Recorder {
  static instances: Recorder[] = []
  static isTypeSupported = (type: string) => type.startsWith('audio/webm')
  state = 'inactive'
  mimeType = 'audio/webm'
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor() { Recorder.instances.push(this) }
  start() { this.state = 'recording' }
  stop() {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob(['recorded audio'], { type: this.mimeType }) })
    Promise.resolve().then(() => this.onstop?.())
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  Recorder.instances = []
  stopTrack.mockClear()
  getUserMedia.mockReset().mockResolvedValue(stream)
  fetchMock.mockReset().mockResolvedValue(Response.json({ text: 'dictated words' }))
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
  vi.stubGlobal('MediaRecorder', Recorder)
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 16))
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 10, y: 10, left: 10, top: 10, right: 310, bottom: 110, width: 300, height: 100, toJSON() {} })
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllTimers(); vi.useRealTimers(); document.body.replaceChildren() })

async function render(value = '', fieldType = 'textarea') {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }] })
  await router.push('/lesson')
  const field = document.createElement(fieldType) as HTMLTextAreaElement
  field.value = value
  document.body.append(field)
  field.focus()
  const wrapper = mount(Dictation, { global: { plugins: [router] }, attachTo: document.body })
  await nextTick()
  return { field, wrapper, router }
}
async function clickMicrophone() { document.querySelector<HTMLButtonElement>('.microphone')!.click(); await flushPromises() }

describe('dictation in editable fields', () => {
  it('records and inserts a transcript at the original selection with an input event', async () => {
    const { field } = await render('Hello world')
    field.setSelectionRange(6, 11)
    // Capture the selection when recording begins.
    const input = vi.fn()
    field.addEventListener('input', input)
    await clickMicrophone()
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true })
    expect(document.querySelector('.recording-meter')!.textContent).toContain('Recording')
    await clickMicrophone()
    expect(field.value).toBe('Hello dictated words')
    expect(input).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/dictation', expect.objectContaining({ method: 'POST', headers: { 'Content-Type': 'audio/webm' }, body: expect.any(Blob), signal: expect.any(AbortSignal) }))
    expect(stopTrack).toHaveBeenCalled()
  })

  it.each([
    ['HelloWorld', 5, 5, 'Hello dictated words World'],
    ['Hello!', 5, 5, 'Hello dictated words!'],
    ['()', 1, 1, '(dictated words)'],
  ])('inserts spacing around a transcript in %s', async (initial, start, end, expected) => {
    const { field } = await render(initial)
    field.setSelectionRange(start, end)
    await clickMicrophone(); await clickMicrophone()
    expect(field.value).toBe(expected)
  })

  it('respects maxlength and keeps edits made while transcription is pending', async () => {
    const { field } = await render('Hello')
    field.maxLength = 12
    await clickMicrophone()
    const pending = deferred<Response>()
    fetchMock.mockReturnValueOnce(pending.promise)
    await clickMicrophone()
    field.value = 'Changed!'
    field.setSelectionRange(8, 8)
    pending.resolve(Response.json({ text: 'new words' }))
    await flushPromises()
    expect(field.value).toBe('Changed! new')
  })

  it('reports no detected speech and server failures', async () => {
    await render()
    fetchMock.mockResolvedValueOnce(Response.json({ text: ' ' }))
    await clickMicrophone(); await clickMicrophone()
    expect(document.querySelector('.notice')!.textContent).toBe('No speech detected.')
    fetchMock.mockResolvedValueOnce(Response.json({ error: 'Transcriber offline' }, { status: 503 }))
    await clickMicrophone(); await clickMicrophone()
    expect(document.querySelector('.notice')!.textContent).toBe('Transcriber offline')
  })

  it.each([['NotAllowedError', 'Microphone access denied.'], ['NotFoundError', "Couldn't start the microphone."]])('reports microphone error %s', async (name, expected) => {
    getUserMedia.mockRejectedValueOnce(Object.assign(new Error('Unavailable'), { name }))
    await render()
    await clickMicrophone()
    expect(document.querySelector('.notice')!.textContent).toBe(expected)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('explains unsupported recording without requesting microphone access', async () => {
    vi.stubGlobal('MediaRecorder', undefined)
    await render()
    await clickMicrophone()
    expect(document.querySelector('.notice')!.textContent).toBe("This browser doesn't support microphone recording.")
    expect(getUserMedia).not.toHaveBeenCalled()
  })

  it('supports Alt+Shift+M and automatically stops after one minute', async () => {
    const { field } = await render()
    window.dispatchEvent(new KeyboardEvent('keydown', { altKey: true, shiftKey: true, code: 'KeyM', cancelable: true }))
    await flushPromises()
    expect(Recorder.instances[0].state).toBe('recording')
    window.dispatchEvent(new KeyboardEvent('keydown', { altKey: true, shiftKey: true, code: 'KeyM', repeat: true }))
    expect(Recorder.instances[0].state).toBe('recording')
    await vi.advanceTimersByTimeAsync(60_000)
    await flushPromises()
    expect(field.value).toBe('dictated words')
    expect(Recorder.instances[0].state).toBe('inactive')
  })

  it('aborts transcription and ignores its result after navigation', async () => {
    const { field, router } = await render('Original')
    await clickMicrophone()
    const pending = deferred<Response>()
    fetchMock.mockReturnValueOnce(pending.promise)
    await clickMicrophone()
    const signal = fetchMock.mock.calls[0][1]!.signal!
    await router.push('/settings')
    expect(signal.aborted).toBe(true)
    pending.resolve(Response.json({ text: 'stale result' }))
    await flushPromises()
    expect(field.value).toBe('Original')
    expect(document.querySelector('.dictation')).toBeNull()
  })

  it('releases a microphone permission result that arrives after unmount', async () => {
    const pending = deferred<typeof stream>()
    getUserMedia.mockReturnValueOnce(pending.promise)
    const { wrapper } = await render()
    await clickMicrophone()
    wrapper.unmount()
    pending.resolve(stream)
    await flushPromises()
    expect(stopTrack).toHaveBeenCalled()
    expect(Recorder.instances).toHaveLength(0)
  })

  it('reports recorder interruption and allows another attempt', async () => {
    await render()
    await clickMicrophone()
    Recorder.instances[0].onerror!()
    await nextTick()
    expect(document.querySelector('.notice')!.textContent).toBe('Recording was interrupted.')
    await clickMicrophone()
    expect(Recorder.instances).toHaveLength(2)
  })

  it('hides controls for readonly fields, password fields and Monaco inputs', async () => {
    const { field } = await render()
    field.readOnly = true
    field.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    await nextTick()
    expect(document.querySelector('.dictation')).toBeNull()
    const password = document.createElement('input')
    password.type = 'password'; document.body.append(password); password.focus()
    await nextTick()
    expect(document.querySelector('.dictation')).toBeNull()
    const monaco = document.createElement('div')
    monaco.className = 'monaco-editor'
    const input = document.createElement('textarea')
    monaco.append(input); document.body.append(monaco); input.focus()
    await nextTick()
    expect(document.querySelector('.dictation')).toBeNull()
  })

  it('docks the toolbar into an explicitly supplied form slot', async () => {
    const { field } = await render()
    const form = document.createElement('form')
    const slot = document.createElement('div')
    slot.setAttribute('data-dictation-slot', '')
    field.setAttribute('data-dictation-dock', '')
    form.append(field, slot); document.body.append(form); field.focus()
    await nextTick()
    expect(slot.querySelector('.dictation.docked')).not.toBeNull()
  })

  it('releases audio analysis and tracks when the page is hidden', async () => {
    const close = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('AudioContext', class {
      resume = vi.fn().mockResolvedValue(undefined)
      close = close
      createAnalyser() { return { fftSize: 1024, getFloatTimeDomainData: (values: Float32Array) => values.fill(0.1) } }
      createMediaStreamSource() { return { connect: vi.fn() } }
    })
    await render()
    await clickMicrophone()
    await vi.advanceTimersByTimeAsync(80)
    expect([...document.querySelectorAll<HTMLElement>('.waveform span')].some((bar) => Number.parseFloat(bar.style.height) > 3)).toBe(true)
    window.dispatchEvent(new Event('pagehide'))
    await flushPromises()
    expect(close).toHaveBeenCalled()
    expect(stopTrack).toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
