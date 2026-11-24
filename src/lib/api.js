import { t } from './i18n.js'
export async function getJSON(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return res.json()
}

export async function putJSON(url, body) {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return res.json()
}

export function ai(task, payload, options) {
  return requestStream(`/api/ai/${task}`, payload, options)
}

export async function requestStream(url, payload, { onProgress, signal } = {}) {
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
  return readNdjson(res, onProgress)
}

/** Czyta strumień NDJSON: {type:'progress'|'done'|'error'}. */
async function readNdjson(res, onProgress) {
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
        const ev = JSON.parse(line)
        if (ev.type === 'progress') onProgress?.(ev)
        else if (ev.type === 'done') return ev.data
        else if (ev.type === 'error') throw new Error(ev.message)
      }
      if (done) throw new Error(t('Połączenie z serwerem zostało przerwane'))
    }
  } finally {
    reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
