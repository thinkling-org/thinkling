// Client for the local Docker sandbox API.
import { getJSON, requestStream } from './api.ts'
import type { SandboxStatus, TestRun, WorkspaceEntry, WorkspaceFile } from '../domain.ts'

async function post<T>(url: string, body: unknown, method = 'POST'): Promise<T> {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `${res.status}`)
  return data
}

type Progress = (message: string) => void
interface FileContents {
  content: string
  mtime: number
}

function ndjson<T>(url: string, body: unknown, onProgress?: Progress): Promise<T> {
  return requestStream<T>(url, body, { onProgress: (ev) => onProgress?.(ev.message) })
}

const enc = encodeURIComponent

export const sandbox = {
  status: () => getJSON<SandboxStatus>('/api/sandbox/status'),
  open: (wsId: string, language: string, files: WorkspaceFile[], { reset = false, onProgress }: { reset?: boolean; onProgress?: Progress } = {}) =>
    ndjson<{ env: string; files: WorkspaceEntry[] }>('/api/sandbox/open', { wsId, language, files, reset }, onProgress),
  files: (ws: string) => getJSON<WorkspaceEntry[]>(`/api/sandbox/${ws}/files`),
  read: (ws: string, path: string) => getJSON<FileContents>(`/api/sandbox/${ws}/file?path=${enc(path)}`),
  write: (ws: string, path: string, content: string) => post<{ mtime: number }>(`/api/sandbox/${ws}/file`, { path, content }, 'PUT'),
  run: (ws: string, cmd: string, { parse = false } = {}) => post<TestRun>(`/api/sandbox/${ws}/run`, { cmd, parse }),
  verify: ({ language, files, testCommand }: { language: string; files: WorkspaceFile[]; testCommand: string }, onProgress?: Progress) =>
    ndjson<TestRun>('/api/sandbox/verify', { language, files, testCommand }, onProgress),
}

export function wsIdFor(id: unknown) {
  return String(id).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80)
}

/** Merge over into base by file path. */
export function mergeFiles(base: WorkspaceFile[] | undefined, ...over: (WorkspaceFile[] | undefined)[]): WorkspaceFile[] {
  const map = new Map((base || []).map((f) => [f.path, f]))
  for (const list of over) for (const f of list || []) map.set(f.path, f)
  return [...map.values()]
}

export function terminalUrl(ws: string) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${location.host}/api/sandbox/${ws}/term`
}
