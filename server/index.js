// DevLingo — lokalny serwer: API + (w trybie produkcyjnym) zbudowany frontend.
import './check-node.js'
import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { providerStatus, runAI } from './providers.js'
import { readState, writeState, DB_PATH } from './store.js'
import * as P from './prompts.js'
import { WebSocketServer } from 'ws'
import * as SB from './sandbox.js'
import { registerSpeech } from './speech.js'
import { registerDictation } from './dictation.js'
import { registerSetup, features } from './setup.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.env.PORT) || 3141
const HOST = process.env.HOST || '127.0.0.1'

const app = express()
app.use(express.json({ limit: '5mb' }))

// Tylko lokalne źródła: obca strona otwarta w przeglądarce nie może wołać API ani terminala.
function localOrigin(origin) {
  if (!origin) return true
  try {
    const h = new URL(origin).hostname
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]'
  } catch {
    return false
  }
}
app.use('/api', (req, res, next) => {
  if (!localOrigin(req.headers.origin)) return res.status(403).json({ error: 'Niedozwolone źródło' })
  next()
})

registerDictation(app, ROOT)
registerSpeech(app, ROOT)
registerSetup(app, ROOT)

// --------------------------------------------------------------- stan

app.get('/api/state', (_req, res) => res.json(readState()))

app.put('/api/state', (req, res) => {
  if (!req.body || typeof req.body !== 'object') return res.status(400).json({ error: 'Zły format' })
  writeState(req.body)
  res.json({ ok: true })
})

// --------------------------------------------------------------- status dostawców

app.get('/api/status', async (_req, res) => {
  const s = readState().settings
  const [claude, codex, feat] = await Promise.all([
    providerStatus('claude', s.claudeBin),
    providerStatus('codex', s.codexBin),
    features(ROOT),
  ])
  res.json({ active: s.provider, model: s.model, effort: s.effort, port: PORT, providers: { claude, codex }, features: feat })
})

// --------------------------------------------------------------- zadania AI (strumień NDJSON)

const TASKS = {
  plan: { build: P.planTask, system: P.SYSTEM_JSON },
  refinePlan: { build: P.refinePlanTask, system: P.SYSTEM_JSON },
  lesson: { build: P.lessonTask, system: P.SYSTEM_JSON },
  gradeOpen: { build: P.gradeOpenTask, system: P.SYSTEM_GRADE },
  reviewCode: { build: P.reviewCodeTask, system: P.SYSTEM_JSON },
  explain: { build: P.explainTask, system: P.SYSTEM_CHAT },
  trace: { build: P.traceTask, system: P.SYSTEM_JSON },
  fixTests: { build: P.fixTestsTask, system: P.SYSTEM_JSON },
  chat: { build: P.chatTask, system: P.SYSTEM_CHAT },
  ping: { build: P.pingTask, system: P.SYSTEM_JSON },
}

app.post('/api/ai/:task', async (req, res) => {
  const task = TASKS[req.params.task]
  if (!task) return res.status(404).json({ error: 'Nieznane zadanie' })

  let built
  try {
    built = task.build(req.body || {})
  } catch (err) {
    return res.status(400).json({ error: `Złe dane wejściowe: ${err.message}` })
  }

  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()

  const send = (obj) => {
    if (!res.writableEnded) res.write(JSON.stringify(obj) + '\n')
  }
  const ctrl = new AbortController()
  res.on('close', () => {
    if (!res.writableEnded) ctrl.abort()
  })

  const started = Date.now()
  let lastSent = 0
  let lastProgress = { chars: 0, partial: '' }
  const tick = setInterval(() => send({ type: 'progress', chars: lastProgress.chars, elapsed: Date.now() - started }), 1000)

  const s = readState().settings
  const provider = req.body?.provider || s.provider
  try {
    const { data } = await runAI({
      provider,
      model: req.body?.model ?? s.model,
      effort: req.body?.effort ?? s.effort,
      binPath: provider === 'codex' ? s.codexBin : s.claudeBin,
      system: task.system,
      prompt: built.prompt,
      schema: built.schema,
      signal: ctrl.signal,
      onProgress: (p) => {
        lastProgress = p
        const now = Date.now()
        if (now - lastSent > 250) {
          lastSent = now
          send({ type: 'progress', chars: p.chars, partial: p.partial, elapsed: now - started })
        }
      },
    })
    send({ type: 'done', data, elapsed: Date.now() - started })
  } catch (err) {
    console.error(`[ai:${req.params.task}]`, err.message)
    send({ type: 'error', message: err.message })
  } finally {
    clearInterval(tick)
    res.end()
  }
})

// --------------------------------------------------------------- piaskownica (Docker)

const wrap = (fn) => async (req, res) => {
  try {
    res.json(await fn(req, res))
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
}

/** Strumień NDJSON z postępem (budowa obrazu bywa długa). */
async function ndjson(res, fn) {
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
  res.flushHeaders?.()
  const send = (o) => !res.writableEnded && res.write(JSON.stringify(o) + '\n')
  try {
    const data = await fn((msg) => send({ type: 'progress', message: msg }))
    send({ type: 'done', data })
  } catch (err) {
    send({ type: 'error', message: err.message })
  } finally {
    res.end()
  }
}

app.get('/api/sandbox/status', wrap(async () => ({ ...(await SB.dockerStatus()), envs: Object.fromEntries(Object.entries(SB.ENVS).map(([k, v]) => [k, v.label])) })))

app.post('/api/sandbox/open', (req, res) =>
  ndjson(res, async (progress) => {
    const { wsId, language, files, reset } = req.body || {}
    SB.safeId(wsId)
    if (!SB.envFor(language)) throw new Error(`Brak środowiska dla języka: ${language}`)
    const seeded = SB.seedWorkspace(wsId, files, { lang: language, reset: !!reset })
    if (reset) await SB.stopWorkspace(wsId)
    await SB.ensureContainer(wsId, language, progress)
    return { seeded, env: SB.envFor(language).label, files: SB.listFiles(wsId) }
  }),
)

app.get('/api/sandbox/:ws/files', wrap((req) => SB.listFiles(SB.safeId(req.params.ws))))
app.get('/api/sandbox/:ws/file', wrap((req) => SB.readFile(req.params.ws, req.query.path)))
app.put('/api/sandbox/:ws/file', wrap((req) => SB.writeFile(req.params.ws, req.body?.path, req.body?.content)))
app.delete('/api/sandbox/:ws/file', wrap((req) => (SB.deletePath(req.params.ws, req.query.path), { ok: true })))

app.post(
  '/api/sandbox/:ws/run',
  wrap(async (req) => {
    const meta = SB.readMeta(req.params.ws)
    if (!meta) throw new Error('Workspace nie istnieje')
    const r = await SB.execIn(req.params.ws, meta.lang, String(req.body?.cmd || ''), { timeoutSec: 90 })
    return req.body?.parse ? { ...SB.parseTestOutput(r.output, r.exitCode), output: r.output } : r
  }),
)

app.post('/api/sandbox/verify', (req, res) =>
  ndjson(res, (progress) => SB.verifyRun({ ...(req.body || {}), onProgress: progress })),
)

// --------------------------------------------------------------- frontend (po `npm run build`)

const DIST = path.join(ROOT, 'dist')
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST))
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(DIST, 'index.html')))
}

const server = app.listen(PORT, HOST, () => {
  console.log(`\n  DevLingo API → http://localhost:${PORT}`)
  console.log(`  Dane: ${DB_PATH}`)
  if (fs.existsSync(DIST)) console.log(`  Aplikacja → http://localhost:${PORT}\n`)
})

// terminal: ws://localhost:3141/api/sandbox/<ws>/term
const wss = new WebSocketServer({ noServer: true })
server.on('upgrade', (req, socket, head) => {
  const m = req.url?.match(/^\/api\/sandbox\/([A-Za-z0-9_-]+)\/term/)
  if (!m || !localOrigin(req.headers.origin)) return socket.destroy()
  wss.handleUpgrade(req, socket, head, (ws) => {
    SB.attachShell(m[1], ws).catch((err) => {
      ws.send(`\r\n\x1b[31m${err.message}\x1b[0m\r\n`)
      ws.close()
    })
  })
})

const shutdown = async () => {
  await SB.cleanupAll()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
