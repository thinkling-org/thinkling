// Blocks from installed plugins, loaded at runtime from /plugins without rebuilding the app.
// Kept separate from registry.ts so the app shell can load plugins without pulling in
// the built-in block views.
import { markRaw, shallowReactive } from 'vue'
import type { BlockDefinition, BlockModule } from './types.ts'

/** A plugin as listed by GET /api/plugins. */
export interface InstalledPluginInfo {
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
  error: string
}

/** Reactive, so a lesson opened before a plugin finished loading picks it up. */
export const installedBlocks = shallowReactive(new Map<string, BlockDefinition>())
/** Plugins that could not be loaded, for the Extensions screen. */
export const pluginProblems = shallowReactive<PluginProblem[]>([])

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

async function fetchPluginList() {
  const response = await fetch('/api/plugins')
  if (!response.ok) throw new Error(`GET /api/plugins: ${response.status}`)
  return response.json() as Promise<{ plugins: InstalledPluginInfo[]; errors: { folder: string; error: string }[] }>
}

/**
 * Load every installed plugin. Never throws: a broken plugin is reported in
 * pluginProblems and the rest still load.
 */
export async function loadInstalledBlocks({
  fetchList = fetchPluginList,
  importModule = (url: string) => import(/* @vite-ignore */ url),
} = {}) {
  let list: Awaited<ReturnType<typeof fetchPluginList>>
  try {
    list = await fetchList()
  } catch (err) {
    console.warn('[plugins] could not list installed plugins', err)
    return
  }
  pluginProblems.splice(0, pluginProblems.length, ...list.errors.map(({ folder, error }) => ({ plugin: folder, error })))
  await Promise.all(list.plugins.map(async (info) => {
    try {
      installedBlocks.set(info.id, toBlockDefinition(info, await importModule(info.entry)))
    } catch (err) {
      pluginProblems.push({ plugin: info.id, error: err?.message || String(err) })
    }
  }))
  for (const problem of pluginProblems) console.warn(`[plugins] ${problem.plugin}: ${problem.error}`)
}
