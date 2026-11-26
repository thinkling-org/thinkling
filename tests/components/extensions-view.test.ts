// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ExtensionsView from '../../src/views/ExtensionsView.vue'
import LearnCard from '../../src/components/exercises/LearnCard.vue'
import { installedBlocks, installedPlugins, loadInstalledBlocks, pluginProblems, pluginState } from '../../src/blocks/installed.ts'

const numberLine = {
  folder: 'examples.number-line', enabled: true, id: 'examples/number-line', version: '1.0.0', engine: '^1.0.0',
  name: 'Number line', summary: 'Move a marker along a number line.', entry: '/plugins/examples.number-line/index.js', locales: {},
}
const blockModule = { default: { normalize: (data) => data, describe: () => '', mount: () => ({ update() {}, unmount() {} }) } }

let server: { plugins: typeof numberLine[]; errors: { folder: string; error: string }[] }
const requests: { method: string; url: string; body?: unknown }[] = []

function fakeFetch(url: string, init: RequestInit = {}) {
  const method = init.method || 'GET'
  requests.push({ method, url, body: init.body })
  const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }))
  if (method === 'GET') return json(server)
  if (method === 'POST') {
    if ((init.body as File).name === 'broken.thinkling') return json({ error: '"engine" "^9.0.0" does not support Thinkling block API 1.0.0' }, 400)
    server.plugins = [numberLine]
    return json({ plugin: numberLine, previousVersion: null })
  }
  if (method === 'PATCH') {
    server.plugins = server.plugins.map((p) => ({ ...p, enabled: JSON.parse(init.body as string).enabled }))
    return json({ ok: true })
  }
  server.plugins = []
  return json({ ok: true })
}

const shell = { AppShell: { template: '<div><slot /></div>' }, RouterLink: { template: '<a><slot /></a>' } }
const file = (name: string) => new File(['zip'], name)

async function pick(wrapper, name: string) {
  const input = wrapper.get('input[type="file"]')
  Object.defineProperty(input.element, 'files', { value: [file(name)], configurable: true })
  await input.trigger('change')
}

beforeEach(async () => {
  server = { plugins: [], errors: [] }
  requests.length = 0
  installedBlocks.clear()
  installedPlugins.splice(0)
  pluginProblems.splice(0)
  vi.stubGlobal('fetch', vi.fn(fakeFetch))
  // Plugin code is not fetched in this test; every entry resolves to the same module.
  await loadInstalledBlocks({ fetchList: () => fakeFetch('/api/plugins').then((r) => r.json()), importModule: async () => blockModule })
})

afterEach(() => vi.unstubAllGlobals())

describe('Extensions screen', () => {
  it('asks the learner to trust a file before uploading and then lists the extension', async () => {
    const wrapper = mount(ExtensionsView, { global: { stubs: shell } })
    await flushPromises()
    expect(wrapper.text()).toContain('No extensions installed yet.')

    await pick(wrapper, 'number-line.thinkling')
    expect(wrapper.text()).toContain('Install number-line.thinkling?')
    expect(requests.some((r) => r.method === 'POST')).toBe(false)

    await wrapper.findAll('button').find((b) => b.text() === 'I trust it, install').trigger('click')
    await flushPromises()
    expect(requests.find((r) => r.method === 'POST')).toMatchObject({ url: '/api/plugins' })
    expect(wrapper.text()).toContain('Installed Number line 1.0.0. New lessons can use it.')
    expect(wrapper.get('article h3').text()).toBe('Number line')
    expect(installedBlocks.has('examples/number-line')).toBe(true)
  })

  it('does nothing when the learner cancels and rejects other file types', async () => {
    const wrapper = mount(ExtensionsView, { global: { stubs: shell } })
    await pick(wrapper, 'notes.pdf')
    expect(wrapper.text()).toContain('Choose a .thinkling file.')

    await pick(wrapper, 'number-line.thinkling')
    await wrapper.findAll('button').find((b) => b.text() === 'Cancel').trigger('click')
    expect(wrapper.text()).not.toContain('Install number-line.thinkling?')
    expect(requests.some((r) => r.method === 'POST')).toBe(false)
  })

  it('explains why a file was rejected', async () => {
    const wrapper = mount(ExtensionsView, { global: { stubs: shell } })
    await pick(wrapper, 'broken.thinkling')
    await wrapper.findAll('button').find((b) => b.text() === 'I trust it, install').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('This file is not a valid Thinkling extension.')
    expect(wrapper.text()).toContain('does not support Thinkling block API')
  })

  it('turns an extension off and removes it after a second click', async () => {
    server.plugins = [numberLine]
    await loadInstalledBlocks()
    const wrapper = mount(ExtensionsView, { global: { stubs: shell } })
    await flushPromises()

    await wrapper.get('input[type="checkbox"]').setValue(false)
    await flushPromises()
    expect(requests.find((r) => r.method === 'PATCH')).toMatchObject({ url: '/api/plugins/examples.number-line', body: '{"enabled":false}' })
    expect(installedBlocks.has('examples/number-line')).toBe(false)

    const remove = () => wrapper.findAll('button').find((b) => /remove/i.test(b.text()))
    await remove().trigger('click')
    expect(requests.some((r) => r.method === 'DELETE')).toBe(false)
    expect(remove().text()).toBe('Click again to remove')
    await remove().trigger('click')
    await flushPromises()
    expect(requests.find((r) => r.method === 'DELETE')).toMatchObject({ url: '/api/plugins/examples.number-line' })
    expect(wrapper.text()).toContain('No extensions installed yet.')
  })
})

describe('a lesson card whose extension is unavailable', () => {
  const exercise = { type: 'learn', title: 'Negative numbers', prompt: '', visualization: { type: 'examples/number-line' } }

  it('says the extension is turned off', async () => {
    server.plugins = [{ ...numberLine, enabled: false }]
    await loadInstalledBlocks()
    const wrapper = mount(LearnCard, { props: { exercise }, global: { stubs: shell } })
    expect(wrapper.text()).toContain('This card uses the “Number line” extension, which is turned off.')
    expect(wrapper.text()).toContain('Manage extensions')
  })

  it('says the extension is not installed, once plugins have loaded', async () => {
    pluginState.ready = false
    const wrapper = mount(LearnCard, { props: { exercise }, global: { stubs: shell } })
    expect(wrapper.find('.missing-extension').exists()).toBe(false)
    pluginState.ready = true
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('This card uses the “examples/number-line” extension, which is not installed.')
  })
})
