import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppUpdater } from 'electron-updater'
import { createDesktopUpdates } from '../../electron/updates.ts'

function setup(enabled = true) {
  const updater = Object.assign(new EventEmitter(), {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    allowPrerelease: true,
    allowDowngrade: true,
    disableWebInstaller: false,
    checkForUpdates: vi.fn<AppUpdater['checkForUpdates']>(),
    downloadUpdate: vi.fn<AppUpdater['downloadUpdate']>(),
    quitAndInstall: vi.fn<AppUpdater['quitAndInstall']>(),
  })
  const prepareInstall = vi.fn<() => Promise<void>>().mockResolvedValue()
  const publish = vi.fn()
  const updates = createDesktopUpdates({ updater, enabled, currentVersion: '0.1.0', prepareInstall, publish })
  updater.checkForUpdates.mockImplementation(async () => {
    updater.emit('update-available', { version: '0.2.0' })
    return null
  })
  updater.downloadUpdate.mockImplementation(async () => {
    updater.emit('download-progress', { percent: 42.7 })
    updater.emit('update-downloaded', { version: '0.2.0' })
    return ['installer.exe']
  })
  return { updater, updates, prepareInstall, publish }
}

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}))
afterEach(() => vi.restoreAllMocks())

describe('desktop update lifecycle', () => {
  it('requests a popup only for an update discovered by the startup check', async () => {
    const startup = setup()
    expect(await startup.updates.check(true)).toMatchObject({ status: 'available', promptAtStartup: true })
    expect(startup.updater.downloadUpdate).not.toHaveBeenCalled()
    expect(startup.updates.dismissPrompt().promptAtStartup).toBe(false)
    expect(startup.updates.getState().status).toBe('available')
    const background = setup()
    expect((await background.updates.check()).promptAtStartup).toBeUndefined()
  })

  it('never contacts the update feed in development or on unsupported platforms', async () => {
    const { updater, updates, prepareInstall } = setup(false)
    await updates.check()
    await updates.download()
    await updates.install()
    expect(updates.getState().status).toBe('disabled')
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
    expect(updater.downloadUpdate).not.toHaveBeenCalled()
    expect(prepareInstall).not.toHaveBeenCalled()
  })

  it('requires user actions for downloading and installing stable updates', async () => {
    const { updater, updates, prepareInstall, publish } = setup()
    expect(updater).toMatchObject({ autoDownload: false, autoInstallOnAppQuit: false, allowPrerelease: false, allowDowngrade: false })
    await updates.download()
    await updates.install()
    expect(updater.downloadUpdate).not.toHaveBeenCalled()
    expect(updater.quitAndInstall).not.toHaveBeenCalled()
    await updates.check()
    expect(updates.getState()).toMatchObject({ status: 'available', availableVersion: '0.2.0' })
    expect(updater.downloadUpdate).not.toHaveBeenCalled()
    await updates.download()
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ status: 'downloading', percent: 42 }))
    expect(updates.getState()).toMatchObject({ status: 'downloaded', percent: 100 })
    expect(updater.quitAndInstall).not.toHaveBeenCalled()
    await updates.install()
    expect(prepareInstall).toHaveBeenCalledOnce()
    expect(updater.quitAndInstall).toHaveBeenCalledExactlyOnceWith(true, true)
    expect(prepareInstall.mock.invocationCallOrder[0]).toBeLessThan(updater.quitAndInstall.mock.invocationCallOrder[0])
  })

  it('serializes checks and preserves the downloaded installer on later checks', async () => {
    const { updater, updates } = setup()
    const check = Promise.withResolvers<null>()
    updater.checkForUpdates.mockReturnValueOnce(check.promise)
    const first = updates.check()
    await updates.check()
    await updates.download()
    expect(updater.checkForUpdates).toHaveBeenCalledOnce()
    expect(updater.downloadUpdate).not.toHaveBeenCalled()
    updater.emit('update-available', { version: '0.2.0' })
    check.resolve(null)
    await first
    await updates.download()
    await updates.check()
    expect(updates.getState().status).toBe('downloaded')
    expect(updater.checkForUpdates).toHaveBeenCalledOnce()
  })

  it('reports the current version when no update exists', async () => {
    const { updater, updates } = setup()
    updater.checkForUpdates.mockImplementationOnce(async () => {
      updater.emit('update-not-available', { version: '0.1.0' })
      return null
    })
    expect(await updates.check()).toEqual({ currentVersion: '0.1.0', status: 'current' })
  })

  it('recovers from an offline check and from a failed download without rechecking', async () => {
    const { updater, updates } = setup()
    updater.checkForUpdates.mockRejectedValueOnce(new Error('offline'))
    expect(await updates.check()).toMatchObject({ status: 'error', retry: 'check' })
    await updates.check()
    updater.downloadUpdate.mockImplementationOnce(async () => {
      const error = new Error('interrupted')
      updater.emit('error', error)
      throw error
    })
    expect(await updates.download()).toMatchObject({ status: 'error', retry: 'download', availableVersion: '0.2.0' })
    await updates.check()
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(2)
    expect((await updates.download()).status).toBe('downloaded')
  })

  it('waits for a successful save and allows retry after a save failure', async () => {
    const { updater, updates, prepareInstall } = setup()
    await updates.check()
    await updates.download()
    prepareInstall.mockRejectedValueOnce(new Error('disk full'))
    expect(await updates.install()).toMatchObject({ status: 'error', retry: 'install' })
    expect(updater.quitAndInstall).not.toHaveBeenCalled()
    const save = Promise.withResolvers<void>()
    prepareInstall.mockReturnValueOnce(save.promise)
    const retry = updates.install()
    await updates.install()
    expect(updates.getState().status).toBe('installing')
    expect(updater.quitAndInstall).not.toHaveBeenCalled()
    save.resolve()
    await retry
    expect(updater.quitAndInstall).toHaveBeenCalledOnce()
  })

  it('ignores unrelated late events and keeps progress finite and bounded', async () => {
    const { updater, updates } = setup()
    await updates.check()
    const download = Promise.withResolvers<string[]>()
    updater.downloadUpdate.mockReturnValueOnce(download.promise)
    const task = updates.download()
    updater.emit('download-progress', { percent: Infinity })
    expect(updates.getState().percent).toBe(0)
    updater.emit('download-progress', { percent: 150 })
    expect(updates.getState().percent).toBe(100)
    updater.emit('update-not-available', {})
    expect(updates.getState().status).toBe('downloading')
    updater.emit('update-downloaded', { version: '0.2.0' })
    download.resolve(['installer.exe'])
    await task
    updater.emit('download-progress', { percent: 20 })
    expect(updates.getState().percent).toBe(100)
  })
})
