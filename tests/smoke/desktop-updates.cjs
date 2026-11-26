// Exercises the packaged main process, sandboxed preload, UI and shutdown with a fake update transport.
// This never downloads or executes an installer and uses a fresh, isolated data directory.
const { app, BrowserWindow, dialog } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const { pathToFileURL } = require('node:url')
const { setTimeout: delay } = require('node:timers/promises')

const root = path.resolve(__dirname, '../..')
const packaged = path.join(root, 'release/win-unpacked/resources/app.asar')
assert.ok(fs.existsSync(packaged), 'Run npm run desktop:package first')
const dataRoot = fs.mkdtempSync(path.join(root, 'release/update-smoke-'))
const data = path.join(dataRoot, 'data')
fs.mkdirSync(data)
fs.writeFileSync(path.join(data, 'db.json'), JSON.stringify({
  stats: { xp: 123 },
  settings: { setupDone: true, locale: 'pl', sound: false },
}))
process.env.THINKLING_DATA = data
app.setPath('userData', dataRoot)
app.getAppPath = () => packaged
app.getVersion = () => require(path.join(root, 'package.json')).version
Object.defineProperty(app, 'isPackaged', { get: () => true })
dialog.showErrorBox = (title, message) => { console.error(title, message); app.exit(1) }

const packagedRequire = createRequire(path.join(packaged, 'package.json'))
const updater = packagedRequire('electron-updater').autoUpdater
let downloads = 0
let installs = 0
let complete = false
let testedWindow = false
updater.checkForUpdates = async () => {
  updater.emit('update-available', { version: '99.0.0' })
  return null
}
updater.downloadUpdate = async () => {
  downloads++
  updater.emit('download-progress', { percent: 42 })
  await delay(300)
  updater.emit('update-downloaded', { version: '99.0.0' })
  return ['fake-installer.exe']
}
updater.quitAndInstall = (silent, forceRunAfter) => {
  installs++
  assert.equal(silent, true)
  assert.equal(forceRunAfter, true)
  complete = true
  app.quit()
}

async function waitFor(test, description) {
  for (let i = 0; i < 200; i++) {
    if (await test()) return
    await delay(50)
  }
  throw new Error(`Timed out: ${description}`)
}

app.on('will-quit', () => {
  try {
    assert.ok(complete, 'Update flow did not finish')
    assert.equal(installs, 1)
    const saved = JSON.parse(fs.readFileSync(path.join(data, 'db.json'), 'utf8'))
    assert.equal(saved.stats.xp, 123)
    assert.equal(saved.settings.locale, 'pl')
    console.log('PASS: packaged preload, IPC, update button, progress, save failure, retry and graceful shutdown')
  } catch (error) {
    console.error(error)
    app.exit(1)
  }
})

app.on('browser-window-created', (_event, window) => {
  if (testedWindow) return
  testedWindow = true
  window.show = () => {}
  const page = window.webContents
  page.setBackgroundThrottling(false)
  page.on('preload-error', (_event, preloadPath, error) => { console.error(preloadPath, error); app.exit(1) })
  page.once('did-finish-load', async () => {
    try {
      const evaluate = (code) => page.executeJavaScript(code)
      await waitFor(() => evaluate('Boolean(window.flushThinklingSave && document.querySelector("#app").textContent.length)'), 'frontend mount')
      assert.equal((await evaluate('window.thinklingUpdates.getState()')).status, 'available')
      await waitFor(() => evaluate('Boolean(document.querySelector(".update-prompt")?.open)'), 'startup update popup')
      assert.equal(await evaluate('document.querySelector(".prompt-title").textContent'), 'Dostępna aktualizacja')
      assert.equal(await evaluate('document.activeElement.classList.contains("prompt-later")'), true)
      await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
      fs.writeFileSync(path.join(root, 'release/update-prompt.png'), (await window.capturePage()).toPNG())
      await evaluate('document.querySelector(".prompt-later").click()')
      await waitFor(() => evaluate('!document.querySelector(".update-prompt").open'), 'dismissed startup popup')
      await waitFor(async () => !(await evaluate('window.thinklingUpdates.getState()')).promptAtStartup, 'dismissal acknowledged in Electron')
      await new Promise(resolve => {
        page.once('did-finish-load', resolve)
        page.reload()
      })
      await waitFor(() => evaluate('Boolean(window.flushThinklingSave && document.querySelector("#app").textContent.length)'), 'frontend remount')
      assert.equal(await evaluate('document.querySelector(".update-prompt").open'), false)
      await evaluate('history.pushState({}, "", "/settings"); dispatchEvent(new PopStateEvent("popstate"))')
      await waitFor(() => evaluate('Boolean(document.querySelector(".desktop-update.compact button"))'), 'available update button')
      assert.equal(downloads, 0)
      assert.equal(installs, 0)
      assert.equal(await evaluate('typeof require'), 'undefined')
      assert.equal(await evaluate('document.querySelectorAll(".desktop-update").length'), 2)
      assert.equal(await evaluate('document.querySelector(".app-version").textContent'), `v${app.getVersion()}`)
      assert.equal(await evaluate('document.querySelector(".update-prompt").open'), false)

      // Another window with the same preload cannot use privileged update commands.
      const stranger = new BrowserWindow({ show: false, webPreferences: {
        sandbox: true, contextIsolation: true, preload: path.join(packaged, 'dist-node/electron/preload.cjs'),
      } })
      await stranger.loadURL('about:blank')
      assert.equal(await stranger.webContents.executeJavaScript('window.thinklingUpdates.install().then(() => false, () => true)'), true)
      stranger.destroy()

      await evaluate('document.querySelector(".desktop-update.compact button").click()')
      await waitFor(() => evaluate('document.querySelector(".desktop-update.compact progress")?.value === 42'), 'download progress')
      await waitFor(() => evaluate('document.querySelector(".desktop-update.compact button")?.textContent.includes("Uruchom ponownie")'), 'restart button')
      assert.equal(downloads, 1)
      assert.equal(installs, 0)
      await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
      fs.writeFileSync(path.join(root, 'release/update-smoke.png'), (await window.capturePage()).toPNG())

      await evaluate('window.smokeSave = window.flushThinklingSave; window.flushThinklingSave = async () => { throw new Error("Simulated save failure") }; document.querySelector(".desktop-update.compact button").click()')
      await waitFor(() => evaluate('Boolean(document.querySelector(".desktop-update.compact [role=alert]"))'), 'save error feedback')
      assert.equal(installs, 0)
      assert.equal(await evaluate('fetch("/api/state").then(r => r.ok)'), true)
      await evaluate('window.flushThinklingSave = window.smokeSave; document.querySelector(".desktop-update.compact button").click()')
    } catch (error) {
      console.error(error)
      app.exit(1)
    }
  })
})

const deadline = setTimeout(() => { console.error('Desktop smoke test timed out'); app.exit(1) }, 30_000)
deadline.unref()
import(pathToFileURL(path.join(packaged, 'dist-node/electron/main.js')).href).catch((error) => {
  console.error(error)
  app.exit(1)
})
