import { describe, expect, it } from 'vitest'
import { desktopPath } from '../../electron/shell-path.ts'

const MARK = '__THINKLING_ENV__'

describe('desktopPath', () => {
  it('leaves Windows alone', async () => {
    expect(await desktopPath({ platform: 'win32', home: 'C:\\Users\\a', run: async () => { throw new Error('not called') } })).toBeUndefined()
  })

  it('takes PATH from the login shell, ignoring profile output, and adds common locations', async () => {
    const calls: [string, string[]][] = []
    const result = await desktopPath({
      platform: 'darwin',
      home: '/Users/a',
      env: { SHELL: '/bin/zsh', PATH: '/usr/bin:/bin' },
      run: async (shell, args) => {
        calls.push([shell, args])
        return `Welcome!\nPATH=/fake\n${MARK}\nHOME=/Users/a\nPATH=/Users/a/.npm/bin:/opt/homebrew/bin:/usr/bin\n${MARK}\n`
      },
    })
    expect(calls[0][0]).toBe('/bin/zsh')
    const parts = result!.split(':')
    expect(parts.slice(0, 3)).toEqual(['/Users/a/.npm/bin', '/opt/homebrew/bin', '/usr/bin'])
    expect(parts).toContain('/usr/local/bin')
    expect(parts).toContain('/Users/a/.local/bin')
    expect(parts).not.toContain('/fake')
    expect(new Set(parts).size).toBe(parts.length)
  })

  it('still starts when the shell fails', async () => {
    const result = await desktopPath({
      platform: 'linux',
      home: '/home/a',
      env: { PATH: '/usr/bin' },
      run: async () => { throw new Error('timeout') },
    })
    const parts = result!.split(':')
    expect(parts[0]).toBe('/usr/bin')
    expect(parts).toContain('/home/a/.local/bin')
    expect(parts).not.toContain('/opt/homebrew/bin')
  })
})
