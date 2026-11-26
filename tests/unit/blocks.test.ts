import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { configureLocale } from '../../src/lib/i18n.ts'
import { BLOCK_SPECS, UNVERSIONED, stampBlockVersion, visualizationInstructions, visualizationSchema } from '../../src/blocks/catalog.ts'
import { BLOCK_API_VERSION } from '../../src/blocks/schema.ts'
import { blockDefinition, describeVisualization, readLessonVisualization, registeredBlockIds } from '../../src/blocks/registry.ts'

const BLOCKS_DIR = path.resolve(import.meta.dirname, '../../src/blocks')
const blockFolders = fs.readdirSync(BLOCKS_DIR, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
const sourceFiles = (folder: string) => fs.readdirSync(path.join(BLOCKS_DIR, folder))
  .filter((name) => /\.(vue|ts)$/.test(name))
  .map((name) => ({ name, source: fs.readFileSync(path.join(BLOCKS_DIR, folder, name), 'utf8') }))
const messagesIn = (source: string) => [...source.matchAll(/(?<![\w.])t\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g)]
  .map((m) => m[1] !== undefined ? m[1].replace(/\\'/g, "'") : JSON.parse(`"${m[2]}"`))

describe('lesson blocks', () => {
  it('registers a renderer for every block the model can produce, in the same order', () => {
    expect(registeredBlockIds()).toEqual(BLOCK_SPECS.map((spec) => spec.id))
    for (const spec of BLOCK_SPECS) {
      const block = blockDefinition(spec.id)
      expect(block.schema).toBe(spec.schema)
      expect(block.instructions).toBe(spec.instructions)
    }
  })

  it('builds a strict tagged schema and instructions for each block', () => {
    const { anyOf } = visualizationSchema()
    expect(anyOf[0]).toEqual({ type: 'null' })
    expect(anyOf.slice(1).map((schema: any) => schema.properties.type.enum)).toEqual(BLOCK_SPECS.map((spec) => [spec.id]))
    for (const schema of anyOf.slice(1) as any[]) {
      expect(schema.additionalProperties).toBe(false)
      expect(schema.required).toEqual(Object.keys(schema.properties))
    }
    const instructions = visualizationInstructions()
    for (const spec of BLOCK_SPECS) expect(instructions).toContain(`  - "${spec.id}": `)
    expect(instructions).toContain('\n    - "duration" is 120–900 seconds.')
  })

  it('normalizes and describes a visualization through the registry', () => {
    const visualization = readLessonVisualization({
      type: 'learn',
      visualization: {
        type: 'step-ordering', instruction: 'Order the steps', success: '', hint: '',
        steps: [{ text: 'a', indent: 0 }, { text: 'b', indent: 9 }, { text: 'c', indent: 1 }],
      },
    })
    expect(visualization.steps[1].indent).toBe(3)
    expect(describeVisualization(visualization)).toBe('Step ordering (correct order):\n1. a\n2. b\n3. c')
  })

  it.each(blockFolders)('%s translates its messages from its own catalog', async (folder) => {
    const files = sourceFiles(folder)
    for (const { name, source } of files) {
      expect(source, `${folder}/${name} must use its block's t from ./messages.ts`).not.toMatch(/import \{[^}]*\bt\b[^}]*\} from '\.\.\/\.\.\/lib\/i18n\.ts'/)
    }
    const messages = [...new Set(files.flatMap(({ source }) => messagesIn(source)))]
    if (!messages.length) return
    const { default: polish } = await import(`../../src/blocks/${folder}/locales/pl.ts`)
    expect(messages.filter((message) => !Object.hasOwn(polish, message))).toEqual([])
  })

  it('follows the interface language for block messages', async () => {
    const { t } = await import('../../src/blocks/code-comparison/messages.ts')
    try {
      configureLocale(() => 'pl-PL')
      expect(t('Compare example variants')).toBe('Porównaj warianty przykładu')
    } finally {
      configureLocale(() => 'en')
    }
    expect(t('Compare example variants')).toBe('Compare example variants')
  })

  it('declares a version, a supported API range, a mount function and translations for every block', () => {
    const [major, minor] = BLOCK_API_VERSION.split('.').map(Number)
    for (const id of registeredBlockIds()) {
      const block = blockDefinition(id)
      expect(block.version, id).toMatch(/^\d+\.\d+\.\d+$/)
      const [, wantMajor, wantMinor] = /^\^(\d+)\.(\d+)\.\d+$/.exec(block.engine).map(Number)
      expect(wantMajor, id).toBe(major)
      expect(wantMinor, id).toBeLessThanOrEqual(minor)
      expect(typeof block.mount, id).toBe('function')
      expect(block.locales?.pl, id).toBeTypeOf('object')
      if (block.exercise) {
        // Exercise mode arrived in API 1.1 and needs a grader.
        expect(wantMinor, id).toBeGreaterThanOrEqual(1)
        expect(typeof block.grade, id).toBe('function')
        expect(block.exercise.instructions.trim(), id).not.toBe('')
      }
    }
  })

  it('stamps the producing block version and hands it back to normalize', () => {
    const stamped = stampBlockVersion({ type: 'step-ordering', steps: [] })
    expect(stamped.blockVersion).toBe(blockDefinition('step-ordering').version)
    expect(stampBlockVersion({ type: 'math/graph' })).toEqual({ type: 'math/graph' })

    const block = blockDefinition('diagnosis')
    const normalize = vi.spyOn(block, 'normalize')
    readLessonVisualization({ type: 'learn', visualization: { type: 'diagnosis', blockVersion: '2.1.0' } })
    readLessonVisualization({ type: 'learn', visualization: { type: 'diagnosis' } })
    expect(normalize.mock.calls.map((call) => call[1])).toEqual([
      { version: '2.1.0', mode: 'visualization' },
      { version: UNVERSIONED, mode: 'visualization' },
    ])
    normalize.mockRestore()
  })

  it('treats a crashing normalizer as invalid data', () => {
    const block = blockDefinition('diagnosis')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const normalize = vi.spyOn(block, 'normalize').mockImplementation(() => { throw new Error('boom') })
    expect(readLessonVisualization({ type: 'learn', visualization: { type: 'diagnosis' } })).toBeNull()
    normalize.mockRestore()
    error.mockRestore()
  })

  it('ignores unknown block types instead of failing', () => {
    expect(readLessonVisualization({ type: 'learn', visualization: { type: 'math/graph' } })).toBeNull()
    expect(readLessonVisualization({ type: 'learn', visualization: { type: 'toString' } })).toBeNull()
    expect(describeVisualization({ type: 'math/graph' })).toBe('')
  })
})
