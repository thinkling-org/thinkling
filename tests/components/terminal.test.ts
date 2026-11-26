// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Terminal from '../../src/components/Terminal.vue'

const adapter = vi.hoisted(() => ({
  input: null as ((data: string) => void) | null,
  resize: null as (() => void) | null,
  term: { cols: 80, rows: 24, write: vi.fn(), focus: vi.fn(), dispose: vi.fn(), clear: vi.fn(), open: vi.fn(), loadAddon: vi.fn() },
  fit: vi.fn(), disconnect: vi.fn(),
}))
vi.mock('@xterm/xterm', () => ({ Terminal: class {
  constructor() { return Object.assign(adapter.term, { onData: (callback) => { adapter.input = callback } }) }
} }))
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class { fit = adapter.fit } }))

class Socket {
  static instances: Socket[] = []
  readyState = 0
  onopen: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onclose: (() => void) | null = null
  send = vi.fn()
  close = vi.fn()
  constructor(public url: string) { Socket.instances.push(this) }
  connect() { this.readyState = 1; this.onopen!() }
}

enableAutoUnmount(afterEach)
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); Socket.instances = []
  vi.stubGlobal('WebSocket', Socket)
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect = adapter.disconnect; constructor(callback) { adapter.resize = callback } })
  vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockReturnValue(document.body)
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllTimers(); vi.useRealTimers() })

describe('sandbox terminal connection', () => {
  it('connects over WebSocket, sends dimensions and forwards input and output', () => {
    const wrapper = mount(Terminal, { props: { wsId: 'lesson' } })
    const socket = Socket.instances[0]
    expect(socket.url).toMatch(/^ws:\/\/.*\/api\/sandbox\/lesson\/term$/)
    socket.connect()
    expect(socket.send).toHaveBeenCalledWith('{"t":"r","c":80,"r":24}')
    adapter.input!('ls\r')
    expect(socket.send).toHaveBeenLastCalledWith('{"t":"i","d":"ls\\r"}')
    socket.onmessage!({ data: 'main.py' })
    expect(adapter.term.write).toHaveBeenCalledWith('main.py')
    socket.onmessage!({ data: new ArrayBuffer(1) })
    expect(adapter.term.write).toHaveBeenLastCalledWith('')
    wrapper.unmount()
    expect(socket.close).toHaveBeenCalledTimes(1)
    expect(adapter.term.dispose).toHaveBeenCalledTimes(1)
    expect(adapter.disconnect).toHaveBeenCalledTimes(1)
  })

  it('offers reconnection after a disconnect and clears the old terminal output', async () => {
    const wrapper = mount(Terminal, { props: { wsId: 'lesson' } })
    Socket.instances[0].onclose!()
    await wrapper.vm.$nextTick()
    expect(wrapper.get('button').text()).toBe('Reconnect')
    await wrapper.get('button').trigger('click')
    expect(adapter.term.clear).toHaveBeenCalledTimes(1)
    expect(Socket.instances).toHaveLength(2)
    Socket.instances[1].connect()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('refits and focuses the terminal when a hidden panel becomes active', async () => {
    const wrapper = mount(Terminal, { props: { wsId: 'lesson', active: false } })
    Socket.instances[0].connect()
    adapter.fit.mockClear()
    await wrapper.setProps({ active: true })
    await vi.advanceTimersByTimeAsync(30)
    expect(adapter.fit).toHaveBeenCalledTimes(1)
    expect(adapter.term.focus).toHaveBeenCalledTimes(1)
    adapter.resize!()
    expect(adapter.fit).toHaveBeenCalledTimes(2)
  })

  it('ignores input before connection and tolerates a transient fit failure', () => {
    mount(Terminal, { props: { wsId: 'lesson' } })
    adapter.input!('ignored')
    expect(Socket.instances[0].send).not.toHaveBeenCalled()
    adapter.fit.mockImplementationOnce(() => { throw new Error('Not measurable') })
    expect(() => Socket.instances[0].connect()).not.toThrow()
    adapter.resize!()
    expect(Socket.instances[0].send).toHaveBeenCalledWith('{"t":"r","c":80,"r":24}')
  })
})
