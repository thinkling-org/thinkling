import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import type { Express } from 'express'
import { paths } from './setup.ts'
import { localeForRequest, t } from './locale.ts'

const AUDIO_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/wav']
let transcribing = false

export function registerDictation(app: Express, root: string) {
  const { whisperPython: python, whisperModel: model } = paths(root)
  const worker = path.join(root, 'server/whisper.py')

  app.post('/api/dictation', express.raw({ type: AUDIO_TYPES, limit: '6mb' }), (req, res) => {
    if (!req.is(AUDIO_TYPES)) return res.status(415).json({ error: t('Unsupported recording format.') })
    if (!Buffer.isBuffer(req.body) || !req.body.length) {
      return res.status(400).json({ error: t('The recording is empty.') })
    }
    if (!fs.existsSync(python) || !fs.existsSync(path.join(model, 'model.bin'))) {
      return res.status(503).json({ error: t('Local Whisper is unavailable.') })
    }
    if (transcribing) return res.status(429).json({ error: t('Whisper is finishing the previous transcription.') })

    transcribing = true
    const controller = new AbortController()
    res.once('close', () => controller.abort())
    const language = localeForRequest(req).split('-')[0]
    const process = execFile(python, [worker, model, language], {
      signal: controller.signal,
      timeout: 120_000,
      maxBuffer: 64 * 1024,
    }, (err, stdout, stderr) => {
      transcribing = false
      if (controller.signal.aborted) return
      if (err) {
        if (stderr) console.error('Whisper:', stderr.trim())
        return res.status(err.killed ? 504 : 502).json({
          error: err.killed ? t('Whisper took too long to transcribe the recording.') : t('Whisper could not read the recording.'),
        })
      }
      try {
        res.json({ text: JSON.parse(stdout).text })
      } catch {
        res.status(502).json({ error: t('Whisper returned an invalid transcription.') })
      }
    })
    process.stdin.on('error', () => {})
    process.stdin.end(req.body)
  })
}
