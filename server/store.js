// Prosty magazyn stanu w pliku JSON (data/db.json).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = process.env.DEVLINGO_DATA || path.join(ROOT, 'data')
const DB_FILE = path.join(DATA_DIR, 'db.json')

fs.mkdirSync(DATA_DIR, { recursive: true })

const DEFAULT_SETTINGS = { provider: 'claude', model: '', effort: '', claudeBin: '', codexBin: '' }

let cache = null

export function readState() {
  if (cache) return cache
  try {
    cache = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))
  } catch {
    cache = {}
  }
  cache.settings = { ...DEFAULT_SETTINGS, ...(cache.settings || {}) }
  return cache
}

export function writeState(next) {
  cache = { ...next, settings: { ...DEFAULT_SETTINGS, ...(next.settings || {}) } }
  const tmp = `${DB_FILE}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 1))
  fs.renameSync(tmp, DB_FILE)
  return cache
}

export const DB_PATH = DB_FILE
