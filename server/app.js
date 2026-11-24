import { t } from './locale.js'
// Codenoms — lokalny serwer: API + (w trybie produkcyjnym) zbudowany frontend.
import express from 'express'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { providerStatus, runAI } from './providers.js'
import { readState, writeState } from './store.js'
import * as P from './prompts.js'
import { WebSocketServer } from 'ws'
import * as SB from './sandbox.js'
import { registerSpeech } from './speech.js'
import { registerDictation } from './dictation.js'
import { registerSetup, features } from './setup.js'
import { initializeLocale, localeForRequest, runWithRequestLocale } from './locale.js'
import { normalizeLocale } from '../src/lib/languages.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'dist')
const routes = express.Router()

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
// --------------------------------------------------------------- stan

routes.get('/api/state', (req, res) => res.json(initializeLocale(req)))

routes.put('/api/state', (req, res) => {
  if (!req.body || typeof req.body !== 'object') return res.status(400).json({ error: t('Zły format') })
  const locale = normalizeLocale(req.body.settings?.locale) || localeForRequest(req)
  writeState({ ...req.body, settings: { ...req.body.settings, locale } })
  res.json({ ok: true })
})

// --------------------------------------------------------------- status dostawców

routes.get('/api/status', async (req, res) => {
  const s = readState().settings
  const [claude, codex, feat] = await Promise.all([
    providerStatus('claude', s.claudeBin),
    providerStatus('codex', s.codexBin),
    features(req.app.locals.resourceRoot),
  ])
  res.json({ active: s.provider, model: s.model, effort: s.effort, port: req.socket.localPort, providers: { claude, codex }, features: feat })
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

routes.post('/api/ai/:task', async (req, res) => {
  const task = TASKS[req.params.task]
  if (!task) return res.status(404).json({ error: t('Nieznane zadanie') })

  let built
  try {
    built = task.build(req.body || {})
  } catch (err) {
    return res.status(400).json({ error: t('Złe dane wejściowe: {0}', [err.message]) })
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
      system: P.withResponseLanguage(task.system, localeForRequest(req)),
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

routes.get('/api/sandbox/status', wrap(async () => ({ ...(await SB.dockerStatus()), envs: Object.fromEntries(Object.entries(SB.ENVS).map(([k, v]) => [k, v.label])) })))

routes.post('/api/sandbox/open', (req, res) =>
  ndjson(res, async (progress) => {
    const { wsId, language, files, reset } = req.body || {}
    SB.safeId(wsId)
    if (!SB.envFor(language)) throw new Error(t('Brak środowiska dla języka: {0}', [language]))
    const seeded = SB.seedWorkspace(wsId, files, { lang: language, reset: !!reset })
    if (reset) await SB.stopWorkspace(wsId)
    await SB.ensureContainer(wsId, language, progress)
    return { seeded, env: SB.envFor(language).label, files: SB.listFiles(wsId) }
  }),
)

routes.get('/api/sandbox/:ws/files', wrap((req) => SB.listFiles(SB.safeId(req.params.ws))))
routes.get('/api/sandbox/:ws/file', wrap((req) => SB.readFile(req.params.ws, req.query.path)))
routes.put('/api/sandbox/:ws/file', wrap((req) => SB.writeFile(req.params.ws, req.body?.path, req.body?.content)))
routes.delete('/api/sandbox/:ws/file', wrap((req) => (SB.deletePath(req.params.ws, req.query.path), { ok: true })))

routes.post(
  '/api/sandbox/:ws/run',
  wrap(async (req) => {
    const meta = SB.readMeta(req.params.ws)
    if (!meta) throw new Error(t('Workspace nie istnieje'))
    const r = await SB.execIn(req.params.ws, meta.lang, String(req.body?.cmd || ''), { timeoutSec: 90 })
    return req.body?.parse ? { ...SB.parseTestOutput(r.output, r.exitCode), output: r.output } : r
  }),
)

routes.post('/api/sandbox/verify', (req, res) =>
  ndjson(res, (progress) => SB.verifyRun({ ...(req.body || {}), onProgress: progress })),
)

export async function startServer({ host, port, resourceRoot = ROOT, systemLanguages, authorize = () => true }) {
  const app = express()
  app.locals.resourceRoot = resourceRoot
  app.locals.systemLanguages = systemLanguages
  app.use((req, res, next) => {
    if (!authorize(req)) return res.sendStatus(403)
    next()
  })
  app.use('/api', (req, res, next) => {
    if (!localOrigin(req.headers.origin)) return res.status(403).json({ error: t('Niedozwolone źródło') })
    runWithRequestLocale(req, next)
  })
  app.use(express.json({ limit: '5mb' }))

  registerDictation(app, resourceRoot)
  registerSpeech(app, resourceRoot)
  registerSetup(app, resourceRoot)
  app.use(routes)

  const index = path.join(DIST, 'index.html')
  const hasFrontend = fs.existsSync(index)
  if (hasFrontend) {
    app.use(express.static(DIST))
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(index))
  }

  const server = http.createServer(app)
  const wss = new WebSocketServer({ noServer: true })
  server.on('upgrade', (req, socket, head) => {
    const m = req.url?.match(/^\/api\/sandbox\/([A-Za-z0-9_-]+)\/term$/)
    if (!m || !authorize(req) || !localOrigin(req.headers.origin)) return socket.destroy()
    wss.handleUpgrade(req, socket, head, (ws) => {
      SB.attachShell(m[1], ws).catch((err) => {
        if (ws.readyState !== ws.OPEN) return
        ws.send(`\r\n\x1b[31m${err.message}\x1b[0m\r\n`)
        ws.close()
      })
    })
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      server.off('error', reject)
      resolve()
    })
  })

  return {
    port: server.address().port,
    hasFrontend,
    async close() {
      const closed = new Promise((resolve) => server.close(resolve))
      for (const ws of wss.clients) ws.terminate()
      wss.close()
      server.closeAllConnections()
      await Promise.all([closed, SB.cleanupAll()])
    },
  }
}
