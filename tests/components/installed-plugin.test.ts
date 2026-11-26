// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LearnCard from '../../src/components/exercises/LearnCard.vue'
import { installedBlocks, loadInstalledBlocks, pluginProblems } from '../../src/blocks/installed.ts'
import { blockDefinition, describeVisualization, readLessonVisualization } from '../../src/blocks/registry.ts'
import { configureLocale } from '../../src/lib/i18n.ts'
import { loadPlugins } from '../../server/plugins.ts'

const EXAMPLES = resolve(import.meta.dirname, '../../examples/plugins')
// Stands in for the browser fetching /plugins/<folder>/<file> from the server.
const importFromExamples = (url: string) => import(pathToFileURL(resolve(EXAMPLES, url.replace(/^\/plugins\//, ''))).href)
const listExamples = async () => {
  const { plugins, errors } = loadPlugins(EXAMPLES)
  return { plugins, errors }
}

const exercise = {
  type: 'learn',
  title: 'Negative numbers',
  prompt: 'Where is -2?',
  visualization: {
    type: 'examples/number-line',
    instruction: 'Move the marker **right**.',
    min: -5, max: 5, step: 0.5, start: -5,
    points: [{ value: -2, label: '-2' }, { value: 0, label: 'zero' }, { value: 3, label: '3' }],
    notes: [{ from: 0, say: 'Past zero the numbers are positive.' }],
  },
}

beforeEach(() => {
  installedBlocks.clear()
  pluginProblems.splice(0)
})

afterEach(() => configureLocale(() => 'en'))

describe('an installed plugin', () => {
  it('is loaded at runtime and renders in a lesson card through ctx only', async () => {
    await loadInstalledBlocks({ fetchList: listExamples, importModule: importFromExamples })
    expect(pluginProblems).toEqual([])
    expect(blockDefinition('examples/number-line')).toBeTruthy()

    configureLocale(() => 'pl')
    const wrapper = mount(LearnCard, { props: { exercise } })
    expect(wrapper.find('strong').text()).toBe('right')
    expect(wrapper.text()).toContain('Znacznik: -5 · Minięte: jeszcze nic')

    const slider = wrapper.get('input[type="range"]')
    await slider.setValue('0.5')
    expect(wrapper.text()).toContain('Znacznik: 0,5 · Minięte: -2, zero')
    expect(wrapper.text()).toContain('Past zero the numbers are positive.')
    wrapper.unmount()
  })

  it('describes its data for the tutor and the host fills in the block type', async () => {
    await loadInstalledBlocks({ fetchList: listExamples, importModule: importFromExamples })
    const visualization = readLessonVisualization(exercise)
    expect(visualization.type).toBe('examples/number-line')
    expect(describeVisualization(visualization)).toContain('Marked values: -2 = -2, zero = 0, 3 = 3.')
  })

  it('reports a plugin whose module is not a block and keeps the others', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await loadInstalledBlocks({
      fetchList: async () => ({
        plugins: [
          { id: 'test/broken', version: '1.0.0', engine: '^1.0.0', name: 'Broken', summary: '', entry: '/plugins/broken/index.js', locales: {} },
          ...(await listExamples()).plugins,
        ],
        errors: [{ folder: 'old', error: 'manifest.json not found' }],
      }),
      importModule: (url) => url.includes('broken') ? Promise.resolve({ default: { normalize() {} } }) : importFromExamples(url),
    })
    expect([...installedBlocks.keys()]).toEqual(['examples/number-line'])
    expect(pluginProblems).toEqual([
      { plugin: 'old', error: 'manifest.json not found' },
      { plugin: 'test/broken', error: "the entry's default export has no describe() function" },
    ])
    warn.mockRestore()
  })

  it('does not break the app when the plugin list is unavailable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(loadInstalledBlocks({ fetchList: () => Promise.reject(new Error('offline')) })).resolves.toBeUndefined()
    expect(installedBlocks.size).toBe(0)
    warn.mockRestore()
  })
})
