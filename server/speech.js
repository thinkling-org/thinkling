import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { normalizeVoiceDesign } from '../src/lib/voice-design.js'
import { readState } from './store.js'
import { designedSpeaker } from './voice-design.js'

const PAUSE_MARKER = '\uE003'

export function registerSpeech(app, root) {
  const zonosUrl = process.env.ZONOS_URL || 'http://127.0.0.1:1919'
  const data = process.env.DEVLINGO_DATA || path.join(root, 'data')
  // Kreator instalacji kopiuje osadzenia do data/zonos/default_voices; starsze ręczne instalacje
  // trzymały je w checkoutcie ZONOS3-Mini.
  const voicesDirectory = [path.join(data, 'zonos/default_voices'), path.join(data, 'zonos/source/assets/default_voices')]
    .find((dir) => existsSync(dir)) || path.join(data, 'zonos/default_voices')
  // Polski głos lektora jest dołączony do repozytorium (server/zonos/voice-pl.npy).
  const defaultEmbedding = [path.join(data, 'zonos/voices/pl.npy'), path.join(root, 'server/zonos/voice-pl.npy')]
    .find((file) => existsSync(file))

  app.get('/api/speech/capabilities', async (_req, res) => {
    let pauseMarker = null
    try {
      const upstream = await fetch(new URL('/v2/capabilities', zonosUrl), {
        signal: AbortSignal.timeout(2_000),
      })
      if (upstream.ok) {
        const { pause_tokens: pauses } = await upstream.json()
        if (pauses?.markers?.includes(PAUSE_MARKER)) pauseMarker = PAUSE_MARKER
      }
    } catch {
      // The player can insert pauses when the model cannot report its capabilities.
    }
    res.set('Cache-Control', 'no-store').json({ pauseMarker })
  })

  app.post('/api/speech', async (req, res) => {
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : ''
    if (!text || [...text].length > 450) {
      return res.status(400).json({ error: 'Tekst do odczytania musi mieć od 1 do 450 znaków.' })
    }

    const requestedDesign = req.body.design === undefined ? readState().settings.voiceDesign : req.body.design
    let design
    try {
      if (requestedDesign != null) design = normalizeVoiceDesign(requestedDesign)
    } catch (err) {
      return res.status(400).json({ error: err.message })
    }

    const voice = process.env.ZONOS_VOICE
    const customEmbedding = process.env.ZONOS_EMBEDDING
    let speaker
    if (design) {
      try {
        speaker = designedSpeaker(design, voicesDirectory)
      } catch {
        return res.status(503).json({ error: 'Brakuje pakietu głosów do projektowania ZONOS3-Mini.' })
      }
    } else if (voice) {
      speaker = { speaker_mode: 'embedding', speaker_embedding_id: voice }
    } else {
      const embeddingPath = customEmbedding || defaultEmbedding
      const embedding = embeddingPath ? await readFile(embeddingPath).catch(() => null) : null
      if (!embedding) return res.status(503).json({ error: 'Brak pliku głosu ZONOS3-Mini.' })
      speaker = {
        speaker_mode: 'embedding',
        speaker_embedding_name: 'voice.npy',
        speaker_embedding_base64: embedding.toString('base64'),
        ...(!customEmbedding && { controls: { 'accents_l1.pol': 1.5 } }),
      }
    }

    const disconnected = new AbortController()
    res.once('close', () => disconnected.abort())
    const timeout = AbortSignal.timeout(120_000)
    const signal = AbortSignal.any([disconnected.signal, timeout])
    try {
      const upstream = await fetch(new URL('/v2/generate', zonosUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          language: 'pl',
          format: 'wav',
          stream: false,
          silence_prefill_frames: 0,
          seed: 42,
          ...speaker,
        }),
        signal,
      })
      if (!upstream.ok || !/^audio\/(wav|x-wav)(?:;|$)/i.test(upstream.headers.get('content-type') || '')) {
        await upstream.body?.cancel()
        return res.status(502).json({ error: 'ZONOS3-Mini nie zwrócił nagrania.' })
      }
      const wav = Buffer.from(await upstream.arrayBuffer())
      res.set('Cache-Control', 'no-store').type('audio/wav').send(wav)
    } catch {
      if (disconnected.signal.aborted) return
      if (timeout.aborted) {
        return res.status(504).json({ error: 'ZONOS3-Mini zbyt długo generuje nagranie.' })
      }
      res.status(503).json({ error: 'Brak połączenia z ZONOS3-Mini. Sprawdź, czy serwer modelu działa.' })
    }
  })
}
