import { t } from './i18n.ts'
export async function getJSON<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return res.json()
}

export async function putJSON<T = unknown>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return res.json()
}

export interface StreamProgress {
  type: 'progress'
  chars?: number
  elapsed?: number
  partial?: string
  message?: string
}

interface StreamOptions {
  onProgress?: (event: StreamProgress) => void
  signal?: AbortSignal
}

export function ai<T = unknown>(task: string, payload: unknown, options?: StreamOptions): Promise<T> {
  return requestStream<T>(`/api/ai/${task}`, payload, options)
}

export async function requestStream<T>(url: string, payload: unknown, { onProgress, signal }: StreamOptions = {}): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
    signal,
  })
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.error || `${res.status}`)
  }
  return readNdjson<T>(res, onProgress)
}

/** Read a stream of NDJSON progress, completion and error events. */
async function readNdjson<T>(res: Response, onProgress?: StreamOptions['onProgress']): Promise<T> {
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  try {
    for (;;) {
      const { value, done } = await reader.read()
      buf += done ? `${decoder.decode()}\n` : decoder.decode(value, { stream: true })
      let nl
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (!line) continue
        const ev = JSON.parse(line) as StreamProgress | { type: 'done'; data: T } | { type: 'error'; message: string }
        if (ev.type === 'progress') onProgress?.(ev)
        else if (ev.type === 'done') return ev.data
        else if (ev.type === 'error') throw new Error(ev.message)
      }
      if (done) throw new Error(t('The connection to the server was interrupted'))
    }
  } finally {
    reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
