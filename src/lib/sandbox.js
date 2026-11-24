// Client for the local Docker sandbox API.
import { getJSON, requestStream } from './api.js'

async function post(url, body, method = 'POST') {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `${res.status}`)
  return data
}

function ndjson(url, body, onProgress) {
  return requestStream(url, body, { onProgress: (ev) => onProgress?.(ev.message) })
}

const enc = encodeURIComponent

export const sandbox = {
  status: () => getJSON('/api/sandbox/status'),
  open: (wsId, language, files, { reset = false, onProgress } = {}) => ndjson('/api/sandbox/open', { wsId, language, files, reset }, onProgress),
  files: (ws) => getJSON(`/api/sandbox/${ws}/files`),
  read: (ws, path) => getJSON(`/api/sandbox/${ws}/file?path=${enc(path)}`),
  write: (ws, path, content) => post(`/api/sandbox/${ws}/file`, { path, content }, 'PUT'),
  run: (ws, cmd, { parse = false } = {}) => post(`/api/sandbox/${ws}/run`, { cmd, parse }),
  verify: ({ language, files, testCommand }, onProgress) => ndjson('/api/sandbox/verify', { language, files, testCommand }, onProgress),
}

export function wsIdFor(id) {
  return String(id).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80)
}

/** Merge over into base by file path. */
export function mergeFiles(base, ...over) {
  const map = new Map((base || []).map((f) => [f.path, f]))
  for (const list of over) for (const f of list || []) map.set(f.path, f)
  return [...map.values()]
}

export function terminalUrl(ws) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${location.host}/api/sandbox/${ws}/term`
}
