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

/**
 * Wywołuje zadanie AI na lokalnym serwerze i czyta strumień NDJSON.
 * @param {string} task  plan | refinePlan | lesson | gradeOpen | reviewCode | explain | chat | ping
 * @param {object} payload
 * @param {{onProgress?:(p:{chars:number,elapsed:number,partial?:string})=>void, signal?:AbortSignal}} opts
 */
export async function ai(task, payload, { onProgress, signal } = {}) {
  const res = await fetch(`/api/ai/${task}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
    signal,
  })
  if (!res.ok || !res.body) {
    let msg = `${res.status}`
    try {
      msg = (await res.json()).error || msg
    } catch {}
    throw new Error(msg)
  }
  return readNdjson(res, onProgress)
}

/** Czyta strumień NDJSON: {type:'progress'|'done'|'error'}. */
export async function readNdjson(res, onProgress) {
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
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
  }
  throw new Error('Połączenie z serwerem zostało przerwane')
}
