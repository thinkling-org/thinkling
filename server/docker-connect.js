// Detect where Docker is listening. The default /var/run/docker.sock may be absent with
// Docker Desktop for Linux, rootless Docker, Colima, OrbStack, and some macOS setups.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Docker from 'dockerode'

const isWin = process.platform === 'win32'
const home = os.homedir()

function socketExists(p) {
  try {
    return fs.statSync(p).isSocket()
  } catch {
    return false
  }
}

/** Convert a DOCKER_HOST URL (unix://, npipe://, tcp://) to dockerode options. */
function fromHost(host) {
  if (!host) return null
  try {
    if (host.startsWith('unix://')) return { socketPath: host.slice('unix://'.length) }
    if (host.startsWith('npipe://')) return { socketPath: host.slice('npipe://'.length).replace(/\//g, '\\') }
    if (host.startsWith('tcp://')) {
      const u = new URL(host)
      return { host: u.hostname, port: Number(u.port) || 2375 }
    }
  } catch {}
  return null
}

/** Read the endpoint from the active Docker CLI context. */
function contextEndpoint() {
  try {
    const out = execFileSync('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'], {
      encoding: 'utf8',
      timeout: 4000,
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    }).trim()
    return fromHost(out)
  } catch {
    return null
  }
}

/** Try DOCKER_HOST first, then the CLI context, then known sockets. */
export function dockerCandidates() {
  const list = []
  const push = (o, label) => o && !list.some((x) => JSON.stringify(x.opts) === JSON.stringify(o)) && list.push({ opts: o, label })
  if (process.env.DOCKER_HOST) push(fromHost(process.env.DOCKER_HOST), `DOCKER_HOST=${process.env.DOCKER_HOST}`)
  const ctx = contextEndpoint()
  if (ctx && (!ctx.socketPath || isWin || socketExists(ctx.socketPath))) push(ctx, 'docker context')
  if (isWin) {
    push({ socketPath: '\\\\.\\pipe\\docker_engine' }, 'Docker Desktop')
    push({ socketPath: '\\\\.\\pipe\\dockerDesktopLinuxEngine' }, 'Docker Desktop')
  } else {
    const runtime = process.env.XDG_RUNTIME_DIR || (process.getuid ? `/run/user/${process.getuid()}` : null)
    const sockets = [
      ['/var/run/docker.sock', 'system Docker'],
      [path.join(home, '.docker', 'desktop', 'docker.sock'), 'Docker Desktop'],
      [path.join(home, '.docker', 'run', 'docker.sock'), 'Docker Desktop'],
      runtime && [path.join(runtime, 'docker.sock'), 'Docker rootless'],
      [path.join(home, '.colima', 'default', 'docker.sock'), 'Colima'],
      [path.join(home, '.orbstack', 'run', 'docker.sock'), 'OrbStack'],
      [path.join(home, '.rd', 'docker.sock'), 'Rancher Desktop'],
    ].filter(Boolean)
    for (const [p, label] of sockets) if (socketExists(p)) push({ socketPath: p }, label)
  }
  return list
}

/** Get the first candidate immediately, without checking connectivity. */
export function initialDocker() {
  const first = dockerCandidates()[0]
  return { docker: new Docker(first?.opts), endpoint: first || null }
}

/** Find the first Docker endpoint that responds. */
export async function findWorkingDocker() {
  let denied = null
  for (const c of dockerCandidates()) {
    const d = new Docker({ ...c.opts, timeout: 3000 })
    try {
      await d.version()
      return { docker: new Docker(c.opts), endpoint: c }
    } catch (err) {
      // Keep trying other sockets after EACCES. If none connect, return the permission
      // issue so setup can suggest adding the user to the docker group.
      if (!denied && (err.code === 'EACCES' || err.code === 'EPERM')) denied = { docker: new Docker(c.opts), endpoint: c, permission: true }
    }
  }
  return denied
}
