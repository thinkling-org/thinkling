import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ai, getJSON, putJSON, requestStream } from '../../src/lib/api.ts'
import type { StreamProgress } from '../../src/lib/api.ts'

const fetchResponse = vi.fn<typeof fetch>()

beforeEach(() => {
  fetchResponse.mockReset()
  vi.stubGlobal('fetch', fetchResponse)
})

afterEach(() => vi.unstubAllGlobals())

describe('JSON requests', () => {
  it('loads saved state', async () => {
    fetchResponse.mockResolvedValue(Response.json({ settings: { locale: 'pl-PL' } }))

    await expect(getJSON('/api/state')).resolves.toEqual({ settings: { locale: 'pl-PL' } })
    expect(fetchResponse).toHaveBeenCalledWith('/api/state')
  })

  it('saves state as JSON', async () => {
    fetchResponse.mockResolvedValue(Response.json({ ok: true }))

    await expect(putJSON('/api/state', { settings: { locale: 'fr-CA' } })).resolves.toEqual({ ok: true })
    expect(fetchResponse).toHaveBeenCalledWith('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '{"settings":{"locale":"fr-CA"}}',
    })
  })

  it('reports failed reads and saves with the HTTP status and response text', async () => {
    fetchResponse
      .mockResolvedValueOnce(new Response('Not found', { status: 404 }))
      .mockResolvedValueOnce(new Response('Disk unavailable', { status: 503 }))

    await expect(getJSON('/api/state')).rejects.toThrow('404 Not found')
    await expect(putJSON('/api/state', {})).rejects.toThrow('503 Disk unavailable')
  })
})

describe('requestStream', () => {
  it('reports the HTTP status when the server error has no usable message', async () => {
    fetchResponse.mockResolvedValue(Response.json({ error: { detail: 'internal data' } }, { status: 502 }))

    await expect(requestStream('/api/ai/lesson', {})).rejects.toThrow(/^502$/)
  })

  it('reads progress and the result when a UTF-8 character spans multiple chunks', async () => {
    const encoder = new TextEncoder()
    const data = encoder.encode('\n{"type":"progress","partial":"Gdańsk"}\r\n{"type":"done","data":{"title":"Gdańsk"}}')
    const split = data.indexOf(0xc5) + 1
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(data.slice(0, split))
        controller.enqueue(data.slice(split))
        controller.close()
      },
    })
    const progress: StreamProgress[] = []
    fetchResponse.mockResolvedValue(new Response(stream))

    await expect(ai<{ title: string }>('lesson', { language: 'javascript' }, {
      onProgress: (event) => progress.push(event),
    })).resolves.toEqual({ title: 'Gdańsk' })
    expect(progress).toEqual([{ type: 'progress', partial: 'Gdańsk' }])
    expect(fetchResponse).toHaveBeenCalledWith('/api/ai/lesson', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"language":"javascript"}',
    })
    expect(stream.locked).toBe(false)
  })

  it('can run without a progress listener or payload', async () => {
    fetchResponse.mockResolvedValue(new Response('{"type":"progress","chars":1}\n{"type":"done","data":true}\n'))

    await expect(requestStream('/api/ai/ping', undefined)).resolves.toBe(true)
    expect(fetchResponse).toHaveBeenCalledWith('/api/ai/ping', expect.objectContaining({ body: '{}' }))
  })

  it('reports a message sent as an error event', async () => {
    const response = new Response('{"type":"error","message":"Provider timed out"}\n')
    fetchResponse.mockResolvedValue(response)

    await expect(requestStream('/api/ai/lesson', {})).rejects.toThrow('Provider timed out')
    expect(response.body?.locked).toBe(false)
  })

  it('rejects a stream that ends before a completed result', async () => {
    fetchResponse.mockResolvedValue(new Response('{"type":"unknown"}\n{"type":"progress","chars":12}\n'))

    await expect(requestStream('/api/ai/lesson', {})).rejects.toThrow('The connection to the server was interrupted')
  })

  it('reports an error message from a failed HTTP response', async () => {
    fetchResponse.mockResolvedValue(Response.json({ error: 'Provider disabled' }, { status: 403 }))

    await expect(requestStream('/api/ai/lesson', {})).rejects.toThrow('Provider disabled')
  })

  it('handles an upstream error response that is plain text', async () => {
    fetchResponse.mockResolvedValue(new Response('Gateway unavailable', { status: 503 }))

    await expect(requestStream('/api/ai/lesson', {})).rejects.toThrow(/^503$/)
  })

  it('uses the response status for a blank error message or a missing stream', async () => {
    fetchResponse
      .mockResolvedValueOnce(Response.json({ error: '  ' }, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))

    await expect(requestStream('/api/ai/lesson', {})).rejects.toThrow(/^500$/)
    await expect(requestStream('/api/ai/lesson', {})).rejects.toThrow(/^204$/)
  })

  it('passes the cancellation signal to the request', async () => {
    fetchResponse.mockImplementation((_input, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true })
    }))
    const controller = new AbortController()

    const result = requestStream('/api/ai/lesson', {}, { signal: controller.signal })
    controller.abort()

    await expect(result).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('preserves the original read failure when cancelling also rejects', async () => {
    const failure = new Error('Connection reset')
    const response = new Response(new ReadableStream({
      start(controller) {
        controller.error(failure)
      },
    }))
    fetchResponse.mockResolvedValue(response)

    await expect(requestStream('/api/ai/lesson', {})).rejects.toBe(failure)
    expect(response.body?.locked).toBe(false)
  })
})
