// Installed block plugins: discovery and validation of their data half.
// The server reads manifest.json, schema.json, instructions.md and locales/*.json.
// It never imports or runs plugin code; index.js is only served to the renderer.
// See docs/architecture/extensibility.md.
import express from 'express'
import type { Express } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { BLOCK_SPECS } from '../src/blocks/catalog.ts'
import { BLOCK_API_VERSION } from '../src/blocks/schema.ts'
import type { BlockSpec } from '../src/blocks/schema.ts'
import { dataDirectory } from './data-directory.ts'

export const pluginsDirectory = () => path.join(dataDirectory(), 'plugins')

/** What the renderer needs to load a plugin. Schema and instructions stay on the server. */
export interface InstalledPlugin {
  id: string
  version: string
  engine: string
  name: string
  summary: string
  /** URL of the ESM entry, served under /plugins. */
  entry: string
  locales: Record<string, Record<string, string>>
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

  const schema = readJson(inside(dir, manifest.schema ?? 'schema.json', 'schema'), 'schema')
  if (!schema || typeof schema !== 'object' || Array.isArray(schema) || !Object.keys(schema).length) {
    throw new Error('the schema must be an object of JSON schema properties')
  }
  if ('type' in schema) throw new Error('the schema must not define "type"; Thinkling adds it')
  if (JSON.stringify(schema).length > LIMITS.schema) throw new Error(`the schema is longer than ${LIMITS.schema} characters`)

  let instructions: string
  try {
    instructions = fs.readFileSync(inside(dir, manifest.instructions ?? 'instructions.md', 'instructions'), 'utf8').trim()
  } catch (err) {
    throw err.code === 'ENOENT' ? new Error('cannot read "instructions": file not found') : err
  }
  if (!instructions || instructions.length > LIMITS.instructions) throw new Error(`instructions must be 1–${LIMITS.instructions} characters`)

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
    spec: { id, version, engine, summary: summary.trim(), schema: strictSchema(schema), instructions },
    plugin: { id, version, engine, name: typeof name === 'string' && name.trim() ? name.trim() : id, summary: summary.trim(), entry, locales },
  }
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
  for (const folder of folders) {
    try {
      const { spec, plugin } = readPlugin(root, folder)
      if (taken.has(spec.id)) throw new Error(`block "${spec.id}" is already installed`)
      taken.add(spec.id)
      specs.push(spec)
      plugins.push(plugin)
    } catch (err) {
      errors.push({ folder, error: err.message })
    }
  }
  return { specs, plugins, errors }
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
