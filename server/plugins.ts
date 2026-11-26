// Installed block plugins: discovery and validation of their data half.
// The server reads manifest.json, schema.json, instructions.md and locales/*.json.
// It never imports or runs plugin code; index.js is only served to the renderer.
// See docs/architecture/extensibility.md.
import express from 'express'
import type { Express } from 'express'
import { unzipSync } from 'fflate'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { BLOCK_SPECS } from '../src/blocks/catalog.ts'
import { BLOCK_API_VERSION } from '../src/blocks/schema.ts'
import type { BlockSpec } from '../src/blocks/schema.ts'
import { dataDirectory } from './data-directory.ts'

export const pluginsDirectory = () => path.join(dataDirectory(), 'plugins')

/** What the renderer needs to load a plugin. Schema and instructions stay on the server. */
export interface InstalledPlugin {
  /** Folder name under the plugins directory; addresses the plugin in the management API. */
  folder: string
  /** Disabled plugins are listed but neither loaded nor offered to the planner. */
  enabled: boolean
  id: string
  version: string
  engine: string
  name: string
  summary: string
  /** URL of the ESM entry, served under /plugins. */
  entry: string
  locales: Record<string, Record<string, string>>
  /** The plugin can also be an interactive, auto-graded exercise (API 1.1). */
  exercise: boolean
}

export interface PluginError {
  folder: string
  error: string
}

const ID = /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/
const LOCALE = /^[a-z]{2}$/
// Limits keep one plugin from flooding the planner catalog or the lesson prompt.
export const LIMITS = { summary: 300, instructions: 4_000, schema: 8_000 }

/** Whether a caret range such as "^1.2.0" accepts the given version. */
export function satisfies(range: string, version: string) {
  const wanted = SEMVER.exec(String(range).replace(/^\^/, ''))
  const actual = SEMVER.exec(version)
  if (!wanted || !actual) return false
  const [w, a] = [wanted.slice(1).map(Number), actual.slice(1).map(Number)]
  if (!String(range).startsWith('^')) return w.every((part, i) => part === a[i])
  return w[0] === a[0] && (a[1] > w[1] || (a[1] === w[1] && a[2] >= w[2]))
}

/**
 * Make every object in a schema strict, as the providers require: all properties
 * required, no additional ones. Plugin authors only list properties.
 */
export function strictSchema(node: any): any {
  if (Array.isArray(node)) return node.map(strictSchema)
  if (!node || typeof node !== 'object') return node
  const out = Object.fromEntries(Object.entries(node).map(([key, value]) => [key, strictSchema(value)]))
  if (out.type === 'object' && out.properties && typeof out.properties === 'object') {
    out.required = Object.keys(out.properties)
    out.additionalProperties = false
  }
  return out
}

/** Resolve a manifest path inside the plugin folder, refusing anything that escapes it. */
function inside(folder: string, relative: unknown, field: string) {
  if (typeof relative !== 'string' || !relative) throw new Error(`"${field}" must be a relative path`)
  const resolved = path.resolve(folder, relative)
  if (resolved !== folder && !resolved.startsWith(folder + path.sep)) throw new Error(`"${field}" points outside the plugin folder`)
  return resolved
}

function readJson(file: string, field: string) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (err) {
    throw new Error(`cannot read "${field}": ${err.code === 'ENOENT' ? 'file not found' : err.message}`)
  }
}

function readPlugin(root: string, folder: string): { spec: BlockSpec; plugin: InstalledPlugin } {
  const dir = path.resolve(root, folder)
  const manifest = readJson(path.join(dir, 'manifest.json'), 'manifest.json')
  const { id, version, engine, name, summary } = manifest
  if (typeof id !== 'string' || !ID.test(id)) throw new Error('"id" must look like "publisher/name" (lowercase letters, digits, hyphens)')
  if (typeof version !== 'string' || !SEMVER.test(version)) throw new Error('"version" must be a version such as "1.0.0"')
  if (typeof engine !== 'string' || !satisfies(engine, BLOCK_API_VERSION)) {
    throw new Error(`"engine" ${JSON.stringify(engine)} does not support Thinkling block API ${BLOCK_API_VERSION}`)
  }
  if (typeof summary !== 'string' || !summary.trim() || summary.length > LIMITS.summary) {
    throw new Error(`"summary" must be 1–${LIMITS.summary} characters`)
  }

  const entryFile = inside(dir, manifest.entry ?? 'index.js', 'entry')
  if (!entryFile.endsWith('.js') || !fs.existsSync(entryFile)) throw new Error('"entry" must be an existing .js file')

  const schema = readSchema(dir, manifest.schema ?? 'schema.json', 'schema')
  const instructions = readInstructions(dir, manifest.instructions ?? 'instructions.md', 'instructions')

  // API 1.1: optional exercise mode, with its own task schema (including the answer key) and instructions.
  let exercise: BlockSpec['exercise']
  if (manifest.exercise !== undefined) {
    if (!manifest.exercise || typeof manifest.exercise !== 'object') throw new Error('"exercise" must be { "schema": …, "instructions": … }')
    // The lowest API version the plugin accepts must already have exercise mode.
    if (!satisfies('^1.1.0', engine.replace(/^\^/, ''))) throw new Error('"exercise" needs block API 1.1; set "engine" to "^1.1.0"')
    exercise = {
      schema: strictSchema(readSchema(dir, manifest.exercise.schema, 'exercise.schema')),
      instructions: readInstructions(dir, manifest.exercise.instructions, 'exercise.instructions'),
    }
  }

  const locales: InstalledPlugin['locales'] = {}
  for (const [locale, file] of Object.entries(manifest.locales ?? {})) {
    if (!LOCALE.test(locale)) throw new Error(`locale "${locale}" must be a two-letter language code`)
    const catalog = readJson(inside(dir, file, `locales.${locale}`), `locales.${locale}`)
    if (!catalog || typeof catalog !== 'object' || Object.values(catalog).some((v) => typeof v !== 'string')) {
      throw new Error(`locale "${locale}" must map English messages to strings`)
    }
    locales[locale] = catalog
  }

  const entry = `/plugins/${encodeURIComponent(folder)}/${path.relative(dir, entryFile).split(path.sep).map(encodeURIComponent).join('/')}`
  return {
    spec: { id, version, engine, summary: summary.trim(), schema: strictSchema(schema), instructions, ...(exercise && { exercise }) },
    plugin: {
      folder, enabled: true, id, version, engine, name: typeof name === 'string' && name.trim() ? name.trim() : id,
      summary: summary.trim(), entry, locales, exercise: !!exercise,
    },
  }
}

function readSchema(dir: string, file: unknown, field: string) {
  const schema = readJson(inside(dir, file, field), field)
  if (!schema || typeof schema !== 'object' || Array.isArray(schema) || !Object.keys(schema).length) {
    throw new Error(`"${field}" must be an object of JSON schema properties`)
  }
  if ('type' in schema) throw new Error(`"${field}" must not define "type"; Thinkling adds it`)
  if (JSON.stringify(schema).length > LIMITS.schema) throw new Error(`"${field}" is longer than ${LIMITS.schema} characters`)
  return schema
}

function readInstructions(dir: string, file: unknown, field: string) {
  let text: string
  try {
    text = fs.readFileSync(inside(dir, file, field), 'utf8').trim()
  } catch (err) {
    throw err.code === 'ENOENT' ? new Error(`cannot read "${field}": file not found`) : err
  }
  if (!text || text.length > LIMITS.instructions) throw new Error(`"${field}" must be 1–${LIMITS.instructions} characters`)
  return text
}

/** Read every plugin folder. Invalid plugins are reported, never thrown. */
export function loadPlugins(root = pluginsDirectory()) {
  const specs: BlockSpec[] = []
  const plugins: InstalledPlugin[] = []
  const errors: PluginError[] = []
  let folders: string[] = []
  try {
    folders = fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => entry.name)
      .sort()
  } catch (err) {
    if (err.code !== 'ENOENT') errors.push({ folder: '.', error: err.message })
  }
  const taken = new Set(BLOCK_SPECS.map((spec) => spec.id))
  const disabled = readDisabled(root)
  for (const folder of folders) {
    try {
      const { spec, plugin } = readPlugin(root, folder)
      if (taken.has(spec.id)) throw new Error(`block "${spec.id}" is already installed`)
      taken.add(spec.id)
      plugin.enabled = !disabled.has(spec.id)
      if (plugin.enabled) specs.push(spec)
      plugins.push(plugin)
    } catch (err) {
      errors.push({ folder, error: err.message })
    }
  }
  return { specs, plugins, errors }
}

// --------------------------------------------------------------- enable / disable

const disabledFile = (root: string) => path.join(root, 'disabled.json')

function readDisabled(root: string): Set<string> {
  try {
    const ids = JSON.parse(fs.readFileSync(disabledFile(root), 'utf8'))?.disabled
    return new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

function writeDisabled(root: string, ids: Set<string>) {
  fs.mkdirSync(root, { recursive: true })
  fs.writeFileSync(disabledFile(root), `${JSON.stringify({ disabled: [...ids].sort() }, null, 2)}\n`)
}

/** Turn a plugin on or off by id. Stored by id so it survives reinstalling. */
export function setPluginEnabled(id: string, enabled: boolean, root = pluginsDirectory()) {
  if (!loadPlugins(root).plugins.some((plugin) => plugin.id === id)) throw new PluginRequestError(404, `plugin "${id}" is not installed`)
  const disabled = readDisabled(root)
  if (enabled) disabled.delete(id)
  else disabled.add(id)
  writeDisabled(root, disabled)
}

// --------------------------------------------------------------- install / remove

/** An error the management API reports with a status code. */
export class PluginRequestError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export const ARCHIVE_LIMITS = { bytes: 10 * 1024 * 1024, files: 500, unpackedBytes: 50 * 1024 * 1024 }

/** Folder a plugin id is installed into, e.g. "examples/number-line" -> "examples.number-line". */
export const folderFor = (id: string) => id.replace('/', '.')

function safeFolderName(folder: string) {
  return typeof folder === 'string' && /^[A-Za-z0-9][\w.-]*$/.test(folder) && !folder.includes('..')
}

/** Unpack a .thinkling archive (a zip of the plugin folder) into memory, refusing unsafe paths. */
function unpack(archive: Uint8Array): Map<string, Uint8Array> {
  if (archive.byteLength > ARCHIVE_LIMITS.bytes) throw new PluginRequestError(413, `the file is larger than ${ARCHIVE_LIMITS.bytes / 1024 / 1024} MB`)
  let count = 0
  let unpacked = 0
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(archive, {
      filter: (file) => {
        count++
        unpacked += file.originalSize
        return count <= ARCHIVE_LIMITS.files && unpacked <= ARCHIVE_LIMITS.unpackedBytes
      },
    })
  } catch {
    throw new PluginRequestError(400, 'the file is not a valid .thinkling (zip) archive')
  }
  if (count > ARCHIVE_LIMITS.files) throw new PluginRequestError(413, `the archive has more than ${ARCHIVE_LIMITS.files} files`)
  if (unpacked > ARCHIVE_LIMITS.unpackedBytes) throw new PluginRequestError(413, 'the archive is too large when unpacked')

  const files = new Map<string, Uint8Array>()
  for (const [name, content] of Object.entries(entries)) {
    if (name.endsWith('/')) continue
    const parts = name.split('/')
    if (name.includes('\\') || name.startsWith('/') || /^[A-Za-z]:/.test(name) || parts.some((part) => !part || part === '.' || part === '..')) {
      throw new PluginRequestError(400, `unsafe path in archive: ${name}`)
    }
    // Skip metadata that archivers add (e.g. __MACOSX/, .DS_Store).
    if (parts[0] === '__MACOSX' || parts.some((part) => part.startsWith('.'))) continue
    files.set(name, content)
  }
  // Accept both a zip of the folder's contents and a zip of the folder itself.
  if (!files.has('manifest.json')) {
    const tops = new Set([...files.keys()].map((name) => name.split('/')[0]))
    const [top] = tops
    if (tops.size !== 1 || !files.has(`${top}/manifest.json`)) throw new PluginRequestError(400, 'manifest.json not found in the archive')
    return new Map([...files].map(([name, content]) => [name.slice(top.length + 1), content]))
  }
  return files
}

/**
 * Install or update a plugin from a .thinkling archive. The archive is unpacked into
 * a hidden staging folder and validated exactly like an installed plugin before it
 * replaces anything, so a bad archive never breaks a working plugin.
 */
export function installPlugin(archive: Uint8Array, root = pluginsDirectory()) {
  const files = unpack(archive)
  fs.mkdirSync(root, { recursive: true })
  const staging = `.staging-${randomUUID()}`
  const stagingDir = path.join(root, staging)
  try {
    for (const [name, content] of files) {
      const target = path.join(stagingDir, ...name.split('/'))
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, content)
    }
    let spec: BlockSpec
    try {
      ({ spec } = readPlugin(root, staging))
    } catch (err) {
      throw new PluginRequestError(400, err.message)
    }
    if (BLOCK_SPECS.some((builtIn) => builtIn.id === spec.id)) throw new PluginRequestError(400, `block "${spec.id}" is built in`)

    const existing = loadPlugins(root).plugins.find((plugin) => plugin.id === spec.id)
    const folder = folderFor(spec.id)
    const target = path.join(root, folder)
    const retired: string[] = []
    // Move the old version aside first, so a failed swap can be rolled back.
    for (const old of new Set([existing && path.join(root, existing.folder), target].filter(Boolean))) {
      if (!fs.existsSync(old)) continue
      const aside = path.join(root, `.old-${randomUUID()}`)
      fs.renameSync(old, aside)
      retired.push(aside)
    }
    try {
      fs.renameSync(stagingDir, target)
    } catch (err) {
      if (retired[0] && existing) fs.renameSync(retired[0], path.join(root, existing.folder))
      throw err
    }
    for (const aside of retired) fs.rmSync(aside, { recursive: true, force: true })
    const installed = loadPlugins(root).plugins.find((plugin) => plugin.id === spec.id)
    return { plugin: installed, previousVersion: existing?.version ?? null }
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true })
  }
}

/** Remove a plugin folder, valid or broken. */
export function removePlugin(folder: string, root = pluginsDirectory()) {
  if (!safeFolderName(folder)) throw new PluginRequestError(400, 'invalid plugin folder')
  const dir = path.join(root, folder)
  if (!fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory()) throw new PluginRequestError(404, `plugin folder "${folder}" not found`)
  const id = loadPlugins(root).plugins.find((plugin) => plugin.folder === folder)?.id
  fs.rmSync(dir, { recursive: true, force: true })
  if (id) {
    const disabled = readDisabled(root)
    if (disabled.delete(id)) writeDisabled(root, disabled)
  }
}

/**
 * GET /api/plugins lists valid plugins and the errors of invalid ones.
 * /plugins/<folder>/... serves plugin files to the renderer (same origin, so the
 * desktop CSP and authorization apply). Missing files are 404s, never the app page.
 */
export function registerPlugins(app: Express, root = pluginsDirectory) {
  app.get('/api/plugins', (_req, res) => {
    const { plugins, errors } = loadPlugins(root())
    res.set('Cache-Control', 'no-store').json({ plugins, errors })
  })

  const handle = (action: (req: express.Request) => unknown) => (req: express.Request, res: express.Response) => {
    try {
      res.json(action(req) ?? { ok: true })
    } catch (err) {
      const status = err instanceof PluginRequestError ? err.status : 500
      res.status(status).json({ error: err.message })
    }
  }
  // The body is the raw .thinkling file. Uploads go through the same origin checks as the rest of /api.
  app.post('/api/plugins', express.raw({ type: () => true, limit: ARCHIVE_LIMITS.bytes }), handle((req) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw new PluginRequestError(400, 'empty upload')
    return installPlugin(new Uint8Array(req.body), root())
  }))
  app.patch('/api/plugins/:folder', handle((req) => {
    const plugin = loadPlugins(root()).plugins.find((item) => item.folder === req.params.folder)
    if (!plugin) throw new PluginRequestError(404, `plugin folder "${req.params.folder}" not found`)
    if (typeof req.body?.enabled !== 'boolean') throw new PluginRequestError(400, '"enabled" must be true or false')
    setPluginEnabled(plugin.id, req.body.enabled, root())
  }))
  app.delete('/api/plugins/:folder', handle((req) => removePlugin(req.params.folder, root())))
  const files = express.Router()
  files.use((req, res, next) => express.static(root(), {
    dotfiles: 'deny',
    index: false,
    fallthrough: false,
    // Plugins can be replaced while the app runs.
    setHeaders: (response) => response.set('Cache-Control', 'no-cache'),
  })(req, res, next))
  files.use((err, _req, res, _next) => res.sendStatus(err.status || err.statusCode || 500))
  app.use('/plugins', files)
}

/** Built-in blocks followed by valid installed plugins: what the planner may choose from. */
export function availableBlockSpecs(root = pluginsDirectory()): readonly BlockSpec[] {
  return [...BLOCK_SPECS, ...loadPlugins(root).specs]
}
