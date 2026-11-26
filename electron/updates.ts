import type { AppUpdater } from 'electron-updater'
import type { AppUpdaterEvents } from 'electron-updater/out/AppUpdater.js'
import type { DesktopUpdateState, UpdateAction } from '../src/lib/desktop-updates.ts'

type Updater = Pick<AppUpdater, 'autoDownload' | 'autoInstallOnAppQuit' | 'allowPrerelease'
  | 'allowDowngrade' | 'disableWebInstaller' | 'checkForUpdates' | 'downloadUpdate' | 'quitAndInstall'> & {
  on<Event extends keyof AppUpdaterEvents>(event: Event, listener: AppUpdaterEvents[Event]): unknown
}

/** Owns the update lifecycle. The renderer can request actions, never supply URLs or paths. */
export function createDesktopUpdates({ updater, enabled, currentVersion, prepareInstall, publish }: {
  updater: Updater
  enabled: boolean
  currentVersion: string
  prepareInstall: () => Promise<void>
  publish: (state: DesktopUpdateState) => void
}) {
  let state: DesktopUpdateState = { status: enabled ? 'idle' : 'disabled', currentVersion }
  let operation: UpdateAction | undefined
  updater.autoDownload = false
  updater.autoInstallOnAppQuit = false
  updater.allowPrerelease = false
  updater.allowDowngrade = false
  updater.disableWebInstaller = true

  function set(next: DesktopUpdateState) {
    state = next
    publish({ ...state })
  }

  function fail(error: unknown, retry: UpdateAction) {
    console.error(`Desktop update ${retry} failed`, error)
    set({ ...state, status: 'error', retry })
  }

  updater.on('update-available', (info) => {
    if (state.status === 'checking') set({ currentVersion, status: 'available', availableVersion: info.version })
  })
  updater.on('update-not-available', () => {
    if (state.status === 'checking') set({ currentVersion, status: 'current' })
  })
  updater.on('download-progress', (progress) => {
    if (state.status !== 'downloading' || !Number.isFinite(progress.percent)) return
    const percent = Math.max(0, Math.min(100, Math.floor(progress.percent)))
    if (Number.isFinite(percent) && percent !== state.percent) set({ ...state, percent })
  })
  updater.on('update-downloaded', (info) => {
    if (state.status === 'downloading') {
      set({ currentVersion, status: 'downloaded', availableVersion: info.version, percent: 100 })
    }
  })
  updater.on('error', (error) => {
    if (operation || state.status === 'installing') fail(error, operation || 'install')
    else console.error('Desktop updater', error)
  })

  async function run(action: UpdateAction, task: () => Promise<unknown>) {
    operation = action
    try {
      await task()
    } catch (error) {
      // electron-updater can both emit an error and reject the same operation.
      if (state.status !== 'error') fail(error, action)
    } finally {
      operation = undefined
    }
    return { ...state }
  }

  return {
    getState: () => ({ ...state }),
    async check() {
      // Do not discard an available or downloaded installer on periodic checks.
      if (!enabled || operation || !['idle', 'current', 'error'].includes(state.status)
        || (state.status === 'error' && state.retry !== 'check')) return { ...state }
      set({ currentVersion, status: 'checking' })
      return run('check', () => updater.checkForUpdates())
    },
    async download() {
      if (!enabled || operation || !(state.status === 'available'
        || (state.status === 'error' && state.retry === 'download'))) return { ...state }
      set({ currentVersion, availableVersion: state.availableVersion, status: 'downloading', percent: 0 })
      return run('download', () => updater.downloadUpdate())
    },
    async install() {
      if (!enabled || operation || !(state.status === 'downloaded'
        || (state.status === 'error' && state.retry === 'install'))) return { ...state }
      set({ ...state, status: 'installing', retry: undefined })
      return run('install', async () => {
        await prepareInstall()
        updater.quitAndInstall(true, true)
      })
    },
  }
}
