import { t } from './locale.ts'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { DEFAULT_VOICE_DESIGN, normalizeVoiceDesign } from '../src/lib/voice-design.ts'
import { readState } from './store.ts'
import { designedSpeaker } from './voice-design.ts'
import type { Express } from 'express'

const PAUSE_MARKER = '\uE003'

export function registerSpeech(app: Express, root: string) {
  const zonosUrl = process.env.ZONOS_URL || 'http://127.0.0.1:1919'
  const data = process.env.CODENOMS_DATA || path.join(root, 'data')
  // Setup copies the embeddings to data/zonos/default_voices. Older manual installs
  // kept them in the ZONOS3-Mini checkout.
  const voicesDirectory = [path.join(data, 'zonos/default_voices'), path.join(data, 'zonos/source/assets/default_voices')]
    .find((dir) => existsSync(dir)) || path.join(data, 'zonos/default_voices')

  app.get('/api/speech/capabilities', async (_req, res) => {
    let pauseMarker = null
    try {
      const upstream = await fetch(new URL('/v2/capabilities', zonosUrl), {
        signal: AbortSignal.timeout(2_000),
      })
      if (upstream.ok) {
        const { pause_tokens: pauses } = await upstream.json() as { pause_tokens?: { markers?: string[] } }
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
      return res.status(400).json({ error: t('Text to read must be 1 to 450 characters long.') })
    }

    // Generate voices from the ZONOS3-Mini voice pack.
    // Use the default voice design if the user has not saved one.
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
      return res.status(503).json({ error: t('The ZONOS3-Mini voice pack is missing. Install the voice model to use speech playback.') })
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
        return res.status(502).json({ error: t('ZONOS3-Mini did not return a recording.') })
      }
      const wav = Buffer.from(await upstream.arrayBuffer())
      res.set('Cache-Control', 'no-store').type('audio/wav').send(wav)
    } catch {
      if (disconnected.signal.aborted) return
      if (timeout.aborted) {
        return res.status(504).json({ error: t('ZONOS3-Mini took too long to generate the recording.') })
      }
      res.status(503).json({ error: t('Could not connect to ZONOS3-Mini. Check that the model server is running.') })
    }
  })
}
