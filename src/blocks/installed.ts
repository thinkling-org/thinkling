// Blocks from installed plugins, loaded at runtime from /plugins without rebuilding the app,
// and the client side of the Extensions screen. Kept separate from registry.ts so the app
// shell can load plugins without pulling in the built-in block views.
import { markRaw, reactive, shallowReactive } from 'vue'
import type { BlockDefinition, BlockModule } from './types.ts'

/** A plugin as listed by GET /api/plugins. */
export interface InstalledPluginInfo {
  folder?: string
  /** Missing means enabled. */
  enabled?: boolean
  id: string
  version: string
  engine: string
  name: string
  summary: string
  entry: string
  locales: Record<string, Record<string, string>>
}

export interface PluginProblem {
  /** Plugin id when known, otherwise its folder name. */
  plugin: string
  /** Folder to remove a broken plugin by, when known. */
  folder?: string
  error: string
}

/** Loaded, enabled plugin blocks. Reactive, so a lesson opened before a plugin loaded picks it up. */
export const installedBlocks = shallowReactive(new Map<string, BlockDefinition>())
/** Every valid plugin, enabled or not, for the Extensions screen and lesson placeholders. */
export const installedPlugins = shallowReactive<InstalledPluginInfo[]>([])
/** Plugins that could not be loaded. */
export const pluginProblems = shallowReactive<PluginProblem[]>([])
export const pluginState = reactive({
  /** The first load finished (successfully or not); until then a missing block may still arrive. */
  ready: false,
  /** A plugin was updated while loaded; files it imports may be stale until restart. */
  restartRecommended: false,
})

const REQUIRED: (keyof BlockModule)[] = ['normalize', 'describe', 'mount']

/** Combine the server's manifest data with the plugin module's default export. */
export function toBlockDefinition(info: InstalledPluginInfo, module: unknown): BlockDefinition {
  const code = (module as { default?: unknown })?.default as Partial<BlockModule> | undefined
  if (!code || typeof code !== 'object') throw new Error('the entry must export default { normalize, describe, mount }')
  for (const name of REQUIRED) {
    if (typeof code[name] !== 'function') throw new Error(`the entry's default export has no ${name}() function`)
  }
  if (code.ownsCode !== undefined && typeof code.ownsCode !== 'function') throw new Error('ownsCode must be a function')
  return markRaw({
    id: info.id,
    version: info.version,
    engine: info.engine,
    summary: info.summary,
    // The schema and instructions are only needed by the server.
    schema: {},
    instructions: '',
    locales: info.locales,
    normalize: code.normalize.bind(code),
    describe: code.describe.bind(code),
    mount: code.mount.bind(code),
    ...(code.ownsCode && { ownsCode: code.ownsCode.bind(code) }),
  })
}

type PluginList = { plugins: InstalledPluginInfo[]; errors: { folder: string; error: string }[] }

async function fetchPluginList(): Promise<PluginList> {
  const response = await fetch('/api/plugins')
  if (!response.ok) throw new Error(`GET /api/plugins: ${response.status}`)
  return response.json()
}

let loaderOptions = {
  fetchList: fetchPluginList,
  importModule: (url: string) => import(/* @vite-ignore */ url),
}

/**
 * Bring the loaded blocks in line with what is installed: load new and updated plugins,
 * drop disabled and removed ones. Never throws: a broken plugin is reported in
 * pluginProblems and the rest still load. Options replace the fetch and import used
 * (tests) and are kept for later reloads.
 */
export async function loadInstalledBlocks(options: Partial<typeof loaderOptions> = {}) {
  loaderOptions = { ...loaderOptions, ...options }
  try {
    let list: PluginList
    try {
      list = await loaderOptions.fetchList()
    } catch (err) {
      console.warn('[plugins] could not list installed plugins', err)
      return
    }
    const enabled = list.plugins.filter((info) => info.enabled !== false)
    installedPlugins.splice(0, installedPlugins.length, ...list.plugins)
    const problems: PluginProblem[] = list.errors.map(({ folder, error }) => ({ plugin: folder, folder, error }))
    for (const id of [...installedBlocks.keys()]) {
      if (!enabled.some((info) => info.id === id)) installedBlocks.delete(id)
    }
    await Promise.all(enabled.map(async (info) => {
      const loaded = installedBlocks.get(info.id)
      if (loaded?.version === info.version) return
      try {
        // The version in the URL makes the browser fetch an updated entry instead of its cached module.
        const definition = toBlockDefinition(info, await loaderOptions.importModule(`${info.entry}?v=${encodeURIComponent(info.version)}`))
        if (loaded) pluginState.restartRecommended = true
        installedBlocks.set(info.id, definition)
      } catch (err) {
        problems.push({ plugin: info.id, folder: info.folder, error: err?.message || String(err) })
      }
    }))
    pluginProblems.splice(0, pluginProblems.length, ...problems)
    for (const problem of problems) console.warn(`[plugins] ${problem.plugin}: ${problem.error}`)
  } finally {
    pluginState.ready = true
  }
}

// --------------------------------------------------------------- management (Extensions screen)

async function request(url: string, init: RequestInit) {
  const response = await fetch(url, init)
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(typeof body?.error === 'string' ? body.error : String(response.status))
  return body
}

/** Install or update from a .thinkling file, then load it. */
export async function installPluginFile(file: Blob): Promise<{ plugin: InstalledPluginInfo; previousVersion: string | null }> {
  const result = await request('/api/plugins', {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: file,
  })
  await loadInstalledBlocks()
  return result
}

export async function setPluginEnabled(folder: string, enabled: boolean) {
  await request(`/api/plugins/${encodeURIComponent(folder)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  })
  await loadInstalledBlocks()
}

export async function removePlugin(folder: string) {
  await request(`/api/plugins/${encodeURIComponent(folder)}`, { method: 'DELETE' })
  await loadInstalledBlocks()
}
