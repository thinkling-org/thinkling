import express from 'express'
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { lessonTask, planTask } from '../../server/prompts.ts'
import { loadPlugins, registerPlugins, satisfies, strictSchema } from '../../server/plugins.ts'
import type { Plan } from '../../src/domain.ts'

const EXAMPLE = resolve(import.meta.dirname, '../../examples/plugins/number-line')
let data: string
let plugins: string
const previousData = process.env.THINKLING_DATA

beforeEach(async () => {
  data = await mkdtemp(join(tmpdir(), 'thinkling-plugins-'))
  plugins = join(data, 'plugins')
  await mkdir(plugins)
  process.env.THINKLING_DATA = data
})

afterEach(async () => {
  if (previousData === undefined) delete process.env.THINKLING_DATA
  else process.env.THINKLING_DATA = previousData
  await rm(data, { recursive: true, force: true })
})

const installExample = (folder = 'number-line') => cp(EXAMPLE, join(plugins, folder), { recursive: true })

async function writePlugin(folder: string, manifest: Record<string, unknown>, files: Record<string, string> = {}) {
  const dir = join(plugins, folder)
  await mkdir(join(dir, 'locales'), { recursive: true })
  const defaults = {
    'index.js': 'export default {}',
    'schema.json': JSON.stringify({ text: { type: 'string' } }),
    'instructions.md': 'when it fits.',
  }
  for (const [name, content] of Object.entries({ ...defaults, ...files })) await writeFile(join(dir, name), content)
  await writeFile(join(dir, 'manifest.json'), JSON.stringify({
    id: `test/${folder}`, version: '1.0.0', engine: '^1.0.0', summary: 'A test block.', ...manifest,
  }))
}

describe('installed plugins', () => {
  it('loads the example plugin as a block spec and a renderer entry', async () => {
    await installExample()
    const { specs, plugins: list, errors } = loadPlugins(plugins)

    expect(errors).toEqual([])
    expect(list).toEqual([{
      id: 'examples/number-line',
      version: '1.0.0',
      engine: '^1.0.0',
      name: 'Number line',
      summary: expect.stringContaining('number line'),
      entry: '/plugins/number-line/index.js',
      locales: { pl: expect.objectContaining({ 'Marker: {0}': 'Znacznik: {0}' }) },
    }])
    const points = specs[0].schema.points as any
    // Authors list properties only; Thinkling makes nested objects strict for the providers.
    expect(points.items).toMatchObject({ required: ['value', 'label'], additionalProperties: false })
    expect(specs[0].instructions).toMatch(/^a value on a scale/)
  })

  it('reports invalid plugins without blocking valid ones', async () => {
    await installExample()
    await writePlugin('bad-id', { id: 'NoSlash' })
    await writePlugin('builtin', { id: 'step-trace' })
    await writePlugin('future', { engine: '^2.0.0' })
    await writePlugin('escape', { entry: '../number-line/index.js' })
    await writePlugin('typed', {}, { 'schema.json': JSON.stringify({ type: { type: 'string' } }) })
    await writePlugin('huge', {}, { 'instructions.md': 'x'.repeat(5_000) })
    await writePlugin('twin', { id: 'examples/number-line' })
    await mkdir(join(plugins, 'empty'))

    const { plugins: list, errors } = loadPlugins(plugins)
    expect(list.map((p) => p.id)).toEqual(['examples/number-line'])
    expect(Object.fromEntries(errors.map((e) => [e.folder, e.error]))).toEqual({
      'bad-id': expect.stringContaining('"id"'),
      builtin: expect.stringContaining('"id"'),
      empty: expect.stringContaining('manifest.json'),
      escape: expect.stringContaining('outside the plugin folder'),
      future: expect.stringContaining('does not support'),
      huge: expect.stringContaining('instructions'),
      twin: expect.stringContaining('already installed'),
      typed: expect.stringContaining('"type"'),
    })
  })

  it('treats a missing plugins folder as no plugins', () => {
    expect(loadPlugins(join(data, 'missing'))).toEqual({ specs: [], plugins: [], errors: [] })
  })

  it('accepts caret ranges within the same major version only', () => {
    expect(satisfies('^1.0.0', '1.0.0')).toBe(true)
    expect(satisfies('^1.0.0', '1.4.2')).toBe(true)
    expect(satisfies('^1.2.0', '1.1.9')).toBe(false)
    expect(satisfies('^2.0.0', '1.9.0')).toBe(false)
    expect(satisfies('1.0.0', '1.0.1')).toBe(false)
    expect(satisfies('latest', '1.0.0')).toBe(false)
  })

  it('makes nested object schemas strict', () => {
    expect(strictSchema({ type: 'array', items: { type: 'object', properties: { a: { type: 'string' } }, required: [] } }))
      .toEqual({ type: 'array', items: { type: 'object', properties: { a: { type: 'string' } }, required: ['a'], additionalProperties: false } })
  })
})

describe('plugin HTTP routes', () => {
  let server: Server
  let base: string

  beforeEach(async () => {
    const app = express()
    registerPlugins(app)
    app.get(/.*/, (_req, res) => res.send('<!doctype html>app'))
    server = await new Promise((done) => {
      const s = app.listen(0, '127.0.0.1', () => done(s))
    })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterEach(() => new Promise<void>((done) => server.close(() => done())))

  it('lists plugins and serves their files, never the app page for missing ones', async () => {
    await installExample()
    const listed = await (await fetch(`${base}/api/plugins`)).json()
    expect(listed.plugins.map((p) => p.id)).toEqual(['examples/number-line'])

    const entry = await fetch(`${base}${listed.plugins[0].entry}`)
    expect(entry.status).toBe(200)
    expect(entry.headers.get('content-type')).toMatch(/javascript/)
    expect(await entry.text()).toBe(await readFile(join(EXAMPLE, 'index.js'), 'utf8'))

    expect((await fetch(`${base}/plugins/number-line/missing.js`)).status).toBe(404)
    expect((await fetch(`${base}/plugins/`)).status).toBe(404)
    const escaped = await fetch(`${base}/plugins/..%2f..%2fdb.json`)
    expect(escaped.status).toBeGreaterThanOrEqual(400)
    expect(await escaped.text()).not.toContain('<!doctype html>')
  })
})

describe('plugins in prompts', () => {
  const profile = { description: 'Learner', minutesPerDay: 20, style: 'balanced' as const }
  const plan = (blocks?: string[]): Plan => ({
    title: 'Plan', summary: '', goal: '', level: 'Junior', levelSummary: '', language: 'other', durationWeeks: 1, weakSpots: [], createdAt: 0,
    modules: [{ id: 'm0', title: 'Fractions', week: 1, description: '', lessons: [{ id: 'l0', title: 'Negative numbers', kind: 'theory', focus: '', status: 'current', ...(blocks && { blocks }) }] }],
  })

  it('offers installed plugins to the planner and their spec to the lessons that use them', async () => {
    await installExample()
    const planning = planTask(profile)
    expect(planning.prompt).toContain('  - "examples/number-line": A number line where')
    expect(planning.schema.properties.modules.items.properties.lessons.items.properties.blocks.items.enum).toContain('examples/number-line')

    const lesson = lessonTask({ profile, plan: plan(['examples/number-line']), moduleIndex: 0, lessonIndex: 0 })
    expect(lesson.prompt).toContain('  - "examples/number-line": a value on a scale')
    const visualization = lesson.schema.properties.exercises.items.properties.visualization
    expect(visualization.anyOf.map((s) => s.type === 'null' ? null : s.properties.type.enum[0])).toEqual([null, 'examples/number-line'])
  })

  it('keeps plugins out of lessons from plans made before blocks were chosen', async () => {
    await installExample()
    const lesson = lessonTask({ profile, plan: plan(), moduleIndex: 0, lessonIndex: 0 })
    expect(lesson.prompt).not.toContain('examples/number-line')
  })
})
