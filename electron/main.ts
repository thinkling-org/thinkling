import { app, BrowserWindow, dialog, session, shell } from 'electron'
import type { Session } from 'electron'
import type { startServer } from '../server/app.ts'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { preferredLocale } from '../src/lib/languages.ts'
import { translate } from '../src/lib/translation.ts'

const HOST = '127.0.0.1'
const AUTH_HEADER = 'x-codenoms-desktop'

app.setName('Codenoms')
if (process.platform === 'win32') app.setAppUserModelId('org.codenoms.desktop')

let backend: Awaited<ReturnType<typeof startServer>> | undefined
let window: BrowserWindow | null = null
let quitting = false
let stopped = false
let startupLocale: string | undefined

function configureSession(desktopSession: Session, origin: string, socketOrigin: string, secret: string) {
  const filter = { urls: [`${origin}/*`, `${socketOrigin}/*`] }
  desktopSession.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    if (details.initiatorOrigin !== undefined && details.initiatorOrigin !== origin) return callback({ cancel: true })
    details.requestHeaders[AUTH_HEADER] = secret
    callback({ requestHeaders: details.requestHeaders })
  })

  const policy = [
    "default-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    `connect-src 'self' ${socketOrigin}`,
    "object-src 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ')
  desktopSession.webRequest.onHeadersReceived(filter, (details, callback) => {
    const responseHeaders = details.responseHeaders || {}
    if (details.resourceType === 'mainFrame') responseHeaders['Content-Security-Policy'] = [policy]
    callback({ responseHeaders })
  })

  desktopSession.setPermissionCheckHandler((_page, permission, requestingOrigin, details) => {
    if (requestingOrigin !== origin || !details.isMainFrame) return false
    return permission === 'clipboard-sanitized-write' || (permission === 'media' && details.mediaType === 'audio')
  })
  desktopSession.setPermissionRequestHandler((_page, permission, callback, details) => {
    const appFrame = details.isMainFrame && URL.parse(details.requestingUrl)?.origin === origin
    const audioOnly = permission === 'media' && 'mediaTypes' in details
      && details.mediaTypes?.length === 1 && details.mediaTypes[0] === 'audio'
    callback(Boolean(appFrame && (permission === 'clipboard-sanitized-write' || audioOnly)))
  })
}

function openExternal(url: string) {
  const target = URL.parse(url)
  if (target && ['https:', 'http:'].includes(target.protocol)) shell.openExternal(target.href).catch(console.error)
}

async function start() {
  const appPath = app.getAppPath()
  const resourceRoot = app.isPackaged ? `${appPath}.unpacked` : appPath
  // The backend reads CODENOMS_DATA when its modules are imported.
  process.env.CODENOMS_DATA ||= path.join(app.getPath('userData'), 'data')
  const { startServer } = await import('../server/app.ts')
  const secret = randomBytes(32).toString('hex')
  const systemLanguages = app.getPreferredSystemLanguages()
  startupLocale = preferredLocale(systemLanguages)
  backend = await startServer({
    host: HOST,
    port: 0,
    resourceRoot,
    systemLanguages,
    authorize: (req) => req.headers[AUTH_HEADER] === secret
      && (!req.headers.origin || req.headers.origin === `http://${HOST}:${req.socket.localPort}`),
  })
  if (!backend.hasFrontend) throw new Error(translate(startupLocale, 'The frontend build is missing. Run npm run desktop.'))
  if (quitting) return

  const origin = `http://${HOST}:${backend.port}`
  const desktopSession = session.fromPartition('codenoms')
  configureSession(desktopSession, origin, `ws://${HOST}:${backend.port}`, secret)
  window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 760,
    minHeight: 540,
    backgroundColor: '#101214',
    show: false,
    autoHideMenuBar: true,
    webPreferences: { session: desktopSession, nodeIntegration: false, contextIsolation: true, sandbox: true },
  })

  const page = window.webContents
  page.setWindowOpenHandler(({ url }) => {
    openExternal(url)
    return { action: 'deny' }
  })
  page.on('will-frame-navigate', (event) => {
    if (event.isMainFrame && URL.parse(event.url)?.origin === origin) return
    event.preventDefault()
    if (event.isMainFrame) openExternal(event.url)
  })
  page.on('will-redirect', (event) => {
    if (URL.parse(event.url)?.origin !== origin) event.preventDefault()
  })

  window.once('ready-to-show', () => { if (!quitting) window.show() })
  window.on('close', (event) => {
    if (stopped) return
    event.preventDefault()
    app.quit()
  })
  window.on('closed', () => { window = null })
  window.loadURL(origin).catch(failStartup)
}

function failStartup(err: Error) {
  if (quitting) return
  console.error(err)
  const message = translate(startupLocale, 'Could not start the application.')
  dialog.showErrorBox('Codenoms', `${message}\n\n${err.message}`)
  app.quit()
}

async function shutdown(ready: Promise<void>) {
  await ready.catch(() => {})
  try {
    if (window && !window.webContents.isDestroyed()) {
      const save = window.webContents.executeJavaScript('window.flushCodenomsSave?.()')
      await Promise.race([save, delay(2_000, undefined, { ref: false })])
    }
  } catch (err) {
    console.error(err)
  }
  await Promise.race([backend?.close(), delay(5_000, undefined, { ref: false })])
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  const ready = app.whenReady().then(start)
  ready.catch(failStartup)
  app.on('second-instance', () => {
    if (!window || quitting) return
    if (window.isMinimized()) window.restore()
    window.focus()
  })
  app.on('before-quit', (event) => {
    if (stopped) return
    event.preventDefault()
    if (quitting) return
    quitting = true
    shutdown(ready).catch(console.error).finally(() => {
      stopped = true
      app.quit()
    })
  })
}
