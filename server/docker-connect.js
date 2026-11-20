// Wykrywanie, gdzie nasłuchuje Docker. Domyślne /var/run/docker.sock nie istnieje m.in. przy
// Docker Desktop na Linuksie, Dockerze bez roota (rootless), Colimie, OrbStacku i części instalacji na macOS.
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

/** Zamienia adres w stylu DOCKER_HOST (unix://, npipe://, tcp://) na opcje dockerode. */
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

/** Adres z aktywnego kontekstu `docker context` (tego samego, którego używa CLI). */
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

/** Kandydaci w kolejności: DOCKER_HOST, kontekst CLI, znane gniazda. */
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
      ['/var/run/docker.sock', 'systemowy Docker'],
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

/** Pierwszy kandydat bez sprawdzania połączenia (do natychmiastowego użycia przy starcie). */
export function initialDocker() {
  const first = dockerCandidates()[0]
  return { docker: new Docker(first?.opts), endpoint: first || null }
}

/** Próbuje kolejnych kandydatów i zwraca pierwszego, który odpowiada. */
export async function findWorkingDocker() {
  let denied = null
  for (const c of dockerCandidates()) {
    const d = new Docker({ ...c.opts, timeout: 3000 })
    try {
      await d.version()
      return { docker: new Docker(c.opts), endpoint: c }
    } catch (err) {
      // EACCES: Docker jest, ale brak uprawnień. Szukamy dalej (np. gniazda rootless), a gdy nic nie działa,
      // zwracamy ten, żeby kreator mógł podpowiedzieć dodanie do grupy „docker”.
      if (!denied && (err.code === 'EACCES' || err.code === 'EPERM')) denied = { docker: new Docker(c.opts), endpoint: c, permission: true }
    }
  }
  return denied
}
