import { execFile } from 'node:child_process'
import path from 'node:path'

const MARK = '__THINKLING_ENV__'

type Run = (shell: string, args: string[]) => Promise<string>

const runShell: Run = (shell, args) => new Promise((resolve, reject) => {
  execFile(shell, args, {
    encoding: 'utf8',
    timeout: 5_000,
    // Keep oh-my-zsh and similar frameworks from prompting or updating during startup.
    env: { ...process.env, DISABLE_AUTO_UPDATE: 'true', ZSH_TMUX_AUTOSTARTED: 'true' },
  }, (error, stdout) => (error ? reject(error) : resolve(stdout)))
})

/**
 * Apps started from Finder, the Dock or some Linux launchers get a minimal PATH such as
 * /usr/bin:/bin, so CLIs installed with Homebrew, npm or the Claude installer are not found.
 * Read PATH from the user's login shell and add the usual install locations.
 */
export async function desktopPath({ env = process.env, platform = process.platform, home, run = runShell }: {
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
  home: string
  run?: Run
}): Promise<string | undefined> {
  if (platform === 'win32') return undefined
  const shell = env.SHELL || (platform === 'darwin' ? '/bin/zsh' : '/bin/sh')
  let fromShell: string[] = []
  try {
    // Print the environment with env(1) so the output format does not depend on the shell (fish keeps PATH as a list).
    const out = await run(shell, ['-ilc', `echo ${MARK}; /usr/bin/env; echo ${MARK}`])
    const line = out.split(MARK)[1]?.split(/\r?\n/).find((l) => l.startsWith('PATH='))
    fromShell = line ? line.slice(5).split(':') : []
  } catch {
    // A broken or slow shell profile must not prevent the app from starting.
  }
  const common = [
    ...(platform === 'darwin' ? ['/opt/homebrew/bin', '/opt/homebrew/sbin'] : []),
    '/usr/local/bin',
    path.posix.join(home, '.local', 'bin'),
    path.posix.join(home, '.claude', 'local'),
    '/usr/bin', '/bin', '/usr/sbin', '/sbin',
  ]
  const entries = [...fromShell, ...(env.PATH || '').split(':'), ...common]
  return [...new Set(entries.map((p) => p.trim()).filter((p) => p.startsWith('/')))].join(':')
}
