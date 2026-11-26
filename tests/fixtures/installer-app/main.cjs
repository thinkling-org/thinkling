// Isolated app used to exercise the real NSIS install and electron-updater restart.
const { app } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const config = require('./probe-config.json')

fs.mkdirSync(config.profile, { recursive: true })
process.env.LOCALAPPDATA = path.join(config.profile, 'cache')
app.setPath('userData', config.profile)
app.disableHardwareAcceleration()

function record(event, extra = {}) {
  fs.appendFileSync(config.events, JSON.stringify({ event, version: app.getVersion(), ...extra }) + '\n')
}
process.on('uncaughtException', error => { record('error', { message: error.stack }); app.exit(1) })
process.on('unhandledRejection', error => { record('error', { message: String(error?.stack || error) }); app.exit(1) })
if (!app.requestSingleInstanceLock()) { record('lock-failed'); app.exit(1) }

let stopped = false
let closing = false
app.on('before-quit', event => {
  if (stopped) return
  event.preventDefault()
  if (closing) return
  closing = true
  // Exercise an asynchronous quit handler as in the desktop app.
  setTimeout(() => { record('shutdown'); stopped = true; app.quit() }, 200)
})
app.whenReady().then(async () => {
  const statePath = path.join(config.profile, 'state.json')
  if (!fs.existsSync(statePath)) fs.writeFileSync(statePath, JSON.stringify({ xp: 123 }))
  record('launched', { argv: process.argv, xp: JSON.parse(fs.readFileSync(statePath)).xp })
  if (app.getVersion() === '0.0.2') return app.quit()

  const { autoUpdater } = require(path.join(config.projectRoot, 'node_modules/electron-updater'))
  const { createDesktopUpdates } = await import(pathToFileURL(path.join(config.projectRoot, 'dist-node/electron/updates.js')).href)
  const updates = createDesktopUpdates({
    updater: autoUpdater,
    enabled: true,
    currentVersion: app.getVersion(),
    publish: state => { if (state.status === 'error') record('error', { state }) },
    prepareInstall: async () => {
      fs.writeFileSync(statePath, JSON.stringify({ xp: 456 }))
      record('saved')
    },
  })
  const timer = setInterval(async () => {
    if (!fs.existsSync(config.command)) return
    clearInterval(timer)
    await updates.check()
    if (updates.getState().status !== 'available') throw new Error('No update found')
    await updates.download()
    if (updates.getState().status !== 'downloaded') throw new Error('Update not downloaded')
    record('installing')
    await updates.install()
  }, 200)
})
