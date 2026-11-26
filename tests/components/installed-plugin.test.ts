// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LearnCard from '../../src/components/exercises/LearnCard.vue'
import { installedBlocks, loadInstalledBlocks, pluginProblems } from '../../src/blocks/installed.ts'
import { blockDefinition, describeVisualization, gradeInteraction, readInteraction, readLessonVisualization } from '../../src/blocks/registry.ts'
import InteractiveExercise from '../../src/components/exercises/InteractiveExercise.vue'
import type { Exercise } from '../../src/domain.ts'
import { configureLocale } from '../../src/lib/i18n.ts'
import { loadPlugins } from '../../server/plugins.ts'

const EXAMPLES = resolve(import.meta.dirname, '../../examples/plugins')
// Stands in for the browser fetching /plugins/<folder>/<file> from the server.
const importFromExamples = (url: string) => import(pathToFileURL(resolve(EXAMPLES, url.replace(/^\/plugins\//, '').replace(/\?.*$/, ''))).href)
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
      { plugin: 'old', folder: 'old', error: 'manifest.json not found' },
      { plugin: 'test/broken', folder: undefined, error: "the entry's default export has no describe() function" },
    ])
    warn.mockRestore()
  })

  it('is an interactive exercise the block grades', async () => {
    await loadInstalledBlocks({ fetchList: listExamples, importModule: importFromExamples })
    const task: Exercise = {
      id: 'mark', type: 'interactive', stage: 'check', prompt: 'Mark −2.5.', explanation: 'Halfway between −3 and −2.',
      interaction: { type: 'examples/number-line', min: -5, max: 5, step: 0.5, start: 0, target: -2.5, tolerance: 0, points: [{ value: 0, label: '0' }, { value: -2.5, label: 'gives it away' }] },
    }
    // The reference mark on the target is dropped, so the line does not reveal the answer.
    expect(readInteraction(task).points.map((p) => p.label)).toEqual(['0'])
    expect(gradeInteraction(task, -2.5)).toEqual({ verdict: 'correct', score: 1 })
    expect(gradeInteraction(task, -2)).toEqual({ verdict: 'almost', score: 0.5, feedback: 'Close. You marked -2.' })
    expect(gradeInteraction(task, 1)).toMatchObject({ verdict: 'wrong', score: 0 })

    configureLocale(() => 'pl')
    const wrapper = mount(InteractiveExercise, { props: { exercise: task, modelValue: null, result: null } })
    // Not an answer until the learner moves the marker.
    expect(wrapper.emitted('update:modelValue')).toEqual([[null]])
    await wrapper.get('input[type="range"]').setValue('-2')
    expect(wrapper.emitted('update:modelValue').at(-1)).toEqual([-2])
    expect(wrapper.text()).toContain('Znacznik: -2')

    await wrapper.setProps({ modelValue: -2, result: { status: 'almost', data: { score: 5, feedback: 'Blisko. Zaznaczono -2.' } } })
    expect((wrapper.get('input[type="range"]').element as HTMLInputElement).disabled).toBe(true)
    expect(wrapper.find('circle.target').exists()).toBe(true)
    expect(wrapper.get('.explain').text()).toContain('Blisko. Zaznaczono -2.')

    // Retrying practice clears the result: input unlocks and the answer is hidden again.
    await wrapper.setProps({ result: null })
    expect((wrapper.get('input[type="range"]').element as HTMLInputElement).disabled).toBe(false)
    expect(wrapper.find('circle.target').exists()).toBe(false)
    wrapper.unmount()
  })

  it('reports a plugin that declares an exercise but cannot grade', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { plugins } = await listExamples()
    await loadInstalledBlocks({
      fetchList: async () => ({ plugins, errors: [] }),
      importModule: async (url) => {
        const { default: block } = await importFromExamples(url)
        return { default: { normalize: block.normalize, describe: block.describe, mount: block.mount } }
      },
    })
    expect(pluginProblems).toEqual([expect.objectContaining({ error: 'the manifest declares an exercise, but the entry has no grade() function' })])
    warn.mockRestore()
  })

  it('does not break the app when the plugin list is unavailable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(loadInstalledBlocks({ fetchList: () => Promise.reject(new Error('offline')) })).resolves.toBeUndefined()
    expect(installedBlocks.size).toBe(0)
    warn.mockRestore()
  })
})
