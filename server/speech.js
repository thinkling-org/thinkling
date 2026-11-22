import { existsSync } from 'node:fs'
import path from 'node:path'
import { DEFAULT_VOICE_DESIGN, normalizeVoiceDesign } from '../src/lib/voice-design.js'
import { readState } from './store.js'
import { designedSpeaker } from './voice-design.js'

const PAUSE_MARKER = '\uE003'

export function registerSpeech(app, root) {
  const zonosUrl = process.env.ZONOS_URL || 'http://127.0.0.1:1919'
  const data = process.env.CODENOMS_DATA || path.join(root, 'data')
  // Kreator instalacji kopiuje osadzenia do data/zonos/default_voices; starsze ręczne instalacje
  // trzymały je w checkoutcie ZONOS3-Mini.
  const voicesDirectory = [path.join(data, 'zonos/default_voices'), path.join(data, 'zonos/source/assets/default_voices')]
    .find((dir) => existsSync(dir)) || path.join(data, 'zonos/default_voices')

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

    // Wszystkie głosy są generowane z pakietu głosów ZONOS3-Mini (projektowanie w Ustawieniach).
    // Bez zapisanego projektu używany jest domyślny projekt.
    const requestedDesign = req.body.design === undefined ? readState().settings.voiceDesign : req.body.design
    let design
    try {
      design = normalizeVoiceDesign(requestedDesign ?? DEFAULT_VOICE_DESIGN)
    } catch (err) {
      return res.status(400).json({ error: err.message })
    }

    let speaker
    try {
      speaker = designedSpeaker(design, voicesDirectory)
    } catch {
      return res.status(503).json({ error: 'Brakuje pakietu głosów do projektowania ZONOS3-Mini. Uruchom krok „Głos lektora” w kreatorze konfiguracji.' })
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
