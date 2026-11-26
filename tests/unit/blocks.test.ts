import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { configureLocale } from '../../src/lib/i18n.ts'
import { BLOCK_SPECS, visualizationInstructions, visualizationSchema } from '../../src/blocks/catalog.ts'
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

  it('ignores unknown block types instead of failing', () => {
    expect(readLessonVisualization({ type: 'learn', visualization: { type: 'math/graph' } })).toBeNull()
    expect(readLessonVisualization({ type: 'learn', visualization: { type: 'toString' } })).toBeNull()
    expect(describeVisualization({ type: 'math/graph' })).toBe('')
  })
})
