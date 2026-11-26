// Prosty magazyn stanu w pliku JSON (data/db.json).
import fs from 'node:fs'
import path from 'node:path'
import { dataDirectory } from './data-directory.ts'
import type { PersistedState, ProviderId, Settings } from '../src/domain.ts'

const DATA_DIR = dataDirectory()
const DB_FILE = path.join(DATA_DIR, 'db.json')

fs.mkdirSync(DATA_DIR, { recursive: true })

const DEFAULT_SETTINGS = { provider: 'claude' as ProviderId, model: '', effort: '', claudeBin: '', codexBin: '' }

type StoredState = Partial<Omit<PersistedState, 'settings'>> & {
  settings: Partial<Settings> & typeof DEFAULT_SETTINGS
}
type StateInput = Partial<Omit<StoredState, 'settings'>> & { settings?: Partial<Settings> }

let cache: StoredState | null = null

export function readState(): StoredState {
  if (cache) return cache
  let data: StateInput
  try {
    data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))
  } catch {
    data = {}
  }
  cache = { ...data, settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) } }
  return cache
}

export function writeState(next: StateInput): StoredState {
  const state = { ...next, settings: { ...DEFAULT_SETTINGS, ...(next.settings || {}) } }
  const tmp = `${DB_FILE}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(state, null, 1))
  fs.renameSync(tmp, DB_FILE)
  cache = state
  return cache
}

export const DB_PATH = DB_FILE
