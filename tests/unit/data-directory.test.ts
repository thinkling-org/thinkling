import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dataDirectory } from '../../server/data-directory.ts'
import { desktopUserData } from '../../electron/user-data.ts'

let root: string
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'thinkling-data-test-'))
  vi.stubEnv('THINKLING_DATA', '')
  vi.stubEnv('CODENOMS_DATA', '')
})
afterEach(() => {
  vi.unstubAllEnvs()
  fs.rmSync(root, { recursive: true, force: true })
})

function save(appName: string) {
  const data = path.join(root, appName, 'data')
  fs.mkdirSync(data, { recursive: true })
  fs.writeFileSync(path.join(data, 'db.json'), '{"stats":{"xp":123}}')
  return path.dirname(data)
}

describe('Thinkling data compatibility', () => {
  it('uses the new data override and falls back to existing launch scripts', () => {
    vi.stubEnv('CODENOMS_DATA', path.join(root, 'legacy'))
    expect(dataDirectory()).toBe(path.join(root, 'legacy'))
    vi.stubEnv('THINKLING_DATA', path.join(root, 'chosen'))
    expect(dataDirectory()).toBe(path.join(root, 'chosen'))
  })

  it('uses the local data directory when neither override is set', () => {
    expect(dataDirectory(root)).toBe(path.join(root, 'data'))
  })

  it('keeps the saved legacy profile in place, including its absolute environment paths', () => {
    const legacy = save('Codenoms')
    const selected = desktopUserData(root, path.join(root, 'Thinkling'))
    expect(selected).toBe(legacy)
    expect(JSON.parse(fs.readFileSync(path.join(selected, 'data/db.json'), 'utf8')).stats.xp).toBe(123)
    expect(fs.existsSync(path.join(root, 'Thinkling'))).toBe(false)
  })

  it('prefers an existing Thinkling database when both profiles exist', () => {
    save('Codenoms')
    const preferred = save('Thinkling')
    expect(desktopUserData(root, preferred)).toBe(preferred)
  })

  it('respects an explicitly configured Electron userData directory', () => {
    save('Codenoms')
    const custom = path.join(root, 'custom')
    expect(desktopUserData(root, custom)).toBe(custom)
  })

  it('starts new installations under Thinkling', () => {
    const preferred = path.join(root, 'Thinkling')
    expect(desktopUserData(root, preferred)).toBe(preferred)
  })
})
