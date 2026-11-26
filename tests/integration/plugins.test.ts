import express from 'express'
import { strToU8, zipSync } from 'fflate'
import { cp, mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join, relative, resolve, sep } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { lessonTask, planTask } from '../../server/prompts.ts'
import {
  availableBlockSpecs, installPlugin, loadPlugins, registerPlugins, removePlugin, satisfies, setPluginEnabled, strictSchema,
} from '../../server/plugins.ts'
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
      folder: 'number-line',
      enabled: true,
      id: 'examples/number-line',
      version: '1.1.0',
      engine: '^1.1.0',
      name: 'Number line',
      summary: expect.stringContaining('number line'),
      entry: '/plugins/number-line/index.js',
      locales: { pl: expect.objectContaining({ 'Marker: {0}': 'Znacznik: {0}' }) },
      exercise: true,
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

  it('loads an exercise mode with its own strict task schema and instructions', async () => {
    await installExample()
    const [spec] = loadPlugins(plugins).specs
    expect(Object.keys(spec.exercise.schema)).toEqual(['min', 'max', 'step', 'start', 'points', 'target', 'tolerance'])
    expect((spec.exercise.schema.points as any).items).toMatchObject({ required: ['value', 'label'], additionalProperties: false })
    expect(spec.exercise.instructions).toMatch(/^the learner marks a value/)
  })

  it('rejects an exercise mode that the declared API cannot have, or whose files are missing', async () => {
    await writePlugin('old-api', { exercise: { schema: 'schema.json', instructions: 'instructions.md' } })
    await writePlugin('no-files', { engine: '^1.1.0', exercise: { schema: 'task.json', instructions: 'task.md' } })
    await writePlugin('outside', { engine: '^1.1.0', exercise: { schema: '../x.json', instructions: 'instructions.md' } })
    const errors = Object.fromEntries(loadPlugins(plugins).errors.map((e) => [e.folder, e.error]))
    expect(errors).toEqual({
      'old-api': expect.stringContaining('needs block API 1.1'),
      'no-files': expect.stringContaining('exercise.schema'),
      outside: expect.stringContaining('outside the plugin folder'),
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

/** Zip a folder like `npm run plugin:pack`, optionally under a top-level folder. */
async function archive(dir: string, { prefix = '', change = {} as Record<string, string> } = {}) {
  const files: Record<string, Uint8Array> = {}
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue
    const name = relative(dir, join(entry.parentPath, entry.name)).split(sep).join('/')
    files[prefix + name] = new Uint8Array(await readFile(join(entry.parentPath, entry.name)))
  }
  for (const [name, content] of Object.entries(change)) files[prefix + name] = strToU8(content)
  return zipSync(files)
}

const exampleManifest = async (changes: Record<string, unknown>) =>
  JSON.stringify({ ...JSON.parse(await readFile(join(EXAMPLE, 'manifest.json'), 'utf8')), ...changes })

describe('installing, disabling and removing plugins', () => {
  it('installs a .thinkling archive into a folder named after the id, and updates it', async () => {
    const first = installPlugin(await archive(EXAMPLE), plugins)
    expect(first).toMatchObject({ plugin: { id: 'examples/number-line', folder: 'examples.number-line', version: '1.1.0' }, previousVersion: null })

    const update = await archive(EXAMPLE, { prefix: 'number-line/', change: { 'manifest.json': await exampleManifest({ version: '1.2.0' }) } })
    expect(installPlugin(update, plugins)).toMatchObject({ plugin: { version: '1.2.0' }, previousVersion: '1.1.0' })
    expect(loadPlugins(plugins).plugins.map((p) => `${p.folder}@${p.version}`)).toEqual(['examples.number-line@1.2.0'])
    // Staging and replaced folders are cleaned up.
    expect((await readdir(plugins)).filter((name) => name.startsWith('.'))).toEqual([])
  })

  it('replaces a manually copied plugin instead of installing a duplicate', async () => {
    await installExample('number-line')
    installPlugin(await archive(EXAMPLE, { change: { 'manifest.json': await exampleManifest({ version: '2.0.0' }) } }), plugins)
    expect(loadPlugins(plugins).plugins.map((p) => `${p.folder}@${p.version}`)).toEqual(['examples.number-line@2.0.0'])
  })

  it('rejects unsafe or invalid archives and keeps the installed version working', async () => {
    installPlugin(await archive(EXAMPLE), plugins)
    const reject = async (bytes: Uint8Array, message: string) => {
      expect(() => installPlugin(bytes, plugins)).toThrow(message)
      expect(loadPlugins(plugins)).toMatchObject({ plugins: [{ version: '1.1.0' }], errors: [] })
    }
    await reject(zipSync({ 'manifest.json': strToU8('{}'), '../evil.js': strToU8('x') }), 'unsafe path')
    await reject(await archive(EXAMPLE, { change: { 'manifest.json': await exampleManifest({ version: '1.3.0', engine: '^9.0.0' }) } }), 'does not support')
    await reject(await archive(EXAMPLE, { change: { 'manifest.json': await exampleManifest({ id: 'step-trace' }) } }), '"id"')
    await reject(zipSync({ 'readme.txt': strToU8('hi') }), 'manifest.json not found')
    await reject(strToU8('not a zip'), 'not a valid .thinkling')
    expect(await readdir(join(data, 'plugins'))).toEqual(['examples.number-line'])
  })

  it('turns a plugin off for the planner and on again', async () => {
    installPlugin(await archive(EXAMPLE), plugins)
    setPluginEnabled('examples/number-line', false, plugins)
    expect(loadPlugins(plugins)).toMatchObject({ specs: [], plugins: [{ id: 'examples/number-line', enabled: false }] })
    expect(availableBlockSpecs(plugins).map((spec) => spec.id)).not.toContain('examples/number-line')

    setPluginEnabled('examples/number-line', true, plugins)
    expect(loadPlugins(plugins).plugins[0].enabled).toBe(true)
    expect(() => setPluginEnabled('test/missing', false, plugins)).toThrow('not installed')
  })

  it('removes valid and broken plugins by folder and forgets their switch', async () => {
    installPlugin(await archive(EXAMPLE), plugins)
    setPluginEnabled('examples/number-line', false, plugins)
    await writePlugin('broken', { id: 'Bad' })

    removePlugin('examples.number-line', plugins)
    removePlugin('broken', plugins)
    expect(loadPlugins(plugins)).toEqual({ specs: [], plugins: [], errors: [] })
    expect(JSON.parse(await readFile(join(plugins, 'disabled.json'), 'utf8'))).toEqual({ disabled: [] })

    expect(() => removePlugin('..', plugins)).toThrow('invalid')
    expect(() => removePlugin('disabled.json', plugins)).toThrow('not found')
  })
})

describe('plugin HTTP routes', () => {
  let server: Server
  let base: string

  beforeEach(async () => {
    const app = express()
    // As in server/app.ts, JSON bodies are parsed before the plugin routes.
    app.use(express.json())
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

  it('installs, switches and removes plugins', async () => {
    const installed = await fetch(`${base}/api/plugins`, {
      method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: await archive(EXAMPLE),
    })
    expect(installed.status).toBe(200)
    expect((await installed.json()).plugin.folder).toBe('examples.number-line')

    const bad = await fetch(`${base}/api/plugins`, { method: 'POST', body: strToU8('nope') })
    expect(bad.status).toBe(400)
    expect((await bad.json()).error).toContain('not a valid')

    const off = await fetch(`${base}/api/plugins/examples.number-line`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: false }),
    })
    expect(off.status).toBe(200)
    expect((await (await fetch(`${base}/api/plugins`)).json()).plugins[0].enabled).toBe(false)

    expect((await fetch(`${base}/api/plugins/examples.number-line`, { method: 'DELETE' })).status).toBe(200)
    expect((await fetch(`${base}/api/plugins/examples.number-line`, { method: 'DELETE' })).status).toBe(404)
    expect((await (await fetch(`${base}/api/plugins`)).json()).plugins).toEqual([])
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

  it('offers an installed plugin as an interactive exercise in lessons that use it', async () => {
    await installExample()
    const lesson = lessonTask({ profile, plan: plan(['examples/number-line']), moduleIndex: 0, lessonIndex: 0 })
    const exercise = lesson.schema.properties.exercises.items.properties
    expect(exercise.type.enum).toContain('interactive')
    expect(exercise.interaction.anyOf[1].properties.target).toEqual({ type: 'number' })
    expect(lesson.prompt).toContain('  - "examples/number-line": the learner marks a value on a number line')
  })

  it('keeps plugins out of lessons from plans made before blocks were chosen', async () => {
    await installExample()
    const lesson = lessonTask({ profile, plan: plan(), moduleIndex: 0, lessonIndex: 0 })
    expect(lesson.prompt).not.toContain('examples/number-line')
  })
})
