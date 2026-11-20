// Kreator pierwszego uruchomienia: diagnostyka środowiska i instalatory dodatków.
// Instalacje działają w tle jako „zadania” — przeglądarka odpytuje GET /api/setup/jobs,
// więc odświeżenie strony nie przerywa pobierania.
import { spawn, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import tar from 'tar-stream'
import { providerStatus, providerAuth, providerModels, clearProviderCaches } from './providers.js'
import { readState } from './store.js'
import * as SB from './sandbox.js'

const isWin = process.platform === 'win32'
const isMac = process.platform === 'darwin'

export const ZONOS_URL = process.env.ZONOS_URL || 'http://127.0.0.1:1919'
const ZONOS_IMAGE = 'devlingo/zonos:1'
const ZONOS_CONTAINER = 'devlingo-zonos'
const ZONOS_FILES = ['gguf/backbone-ptq-edit.gguf', 'gguf/zac-keep2.gguf', 'gguf/steer.gguf']
const WHISPER_FILES = ['config.json', 'model.bin', 'tokenizer.json', 'vocabulary.txt']

export function paths(root) {
  const data = path.resolve(process.env.DEVLINGO_DATA || path.join(root, 'data'))
  const venv = path.join(data, 'whisper', 'venv')
  return {
    data,
    zonosDir: path.join(data, 'zonos'),
    zonosModels: path.join(data, 'zonos', 'models'),
    zonosVoices: path.join(data, 'zonos', 'default_voices'),
    zonosContext: path.join(root, 'server', 'zonos'),
    whisperVenv: venv,
    whisperPython: process.env.WHISPER_PYTHON || path.join(venv, isWin ? 'Scripts/python.exe' : 'bin/python'),
    whisperModel: process.env.WHISPER_MODEL || path.join(data, 'whisper', 'model'),
    whisperRequirements: path.join(root, 'server', 'whisper-requirements.txt'),
  }
}

// --------------------------------------------------------------- narzędzia

const exists = (p) => {
  try {
    fs.statSync(p)
    return true
  } catch {
    return false
  }
}

function which(name) {
  try {
    const out = execFileSync(isWin ? 'where' : 'which', [name], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true })
    return out.split(/\r?\n/).map((s) => s.trim()).find(Boolean) || null
  } catch {
    return null
  }
}

/** Uruchamia proces i przekazuje każdą linię wyjścia do `onLine`. */
function run(cmd, args, { onLine, env, cwd } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env: env || process.env, cwd, windowsHide: true })
    let tail = ''
    const feed = (d) => {
      const text = String(d)
      tail = (tail + text).slice(-4000)
      for (const line of text.split(/\r?\n|\r/)) if (line.trim()) onLine?.(line.trim().slice(0, 200))
    }
    child.stdout.on('data', feed)
    child.stderr.on('data', feed)
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolve(tail) : reject(new Error(`${path.basename(cmd)} zakończył się kodem ${code}.\n${tail.slice(-600)}`))))
  })
}

export async function download(url, dest, onProgress) {
  if (exists(dest)) return
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  const tmp = `${dest}.part`
  // Wznawianie: jeśli poprzednie pobieranie się urwało, prosimy o resztę pliku (HTTP Range).
  let have = 0
  try {
    have = fs.statSync(tmp).size
  } catch {}
  let res
  for (let attempt = 1; ; attempt++) {
    try {
      res = await fetch(url, { redirect: 'follow', headers: have ? { Range: `bytes=${have}-` } : {} })
      if (res.status === 416) {
        // Część już jest kompletna.
        fs.renameSync(tmp, dest)
        return
      }
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
      break
    } catch (err) {
      if (attempt >= 3) throw new Error(`Nie udało się pobrać ${path.basename(dest)} (${err.message}). Sprawdź połączenie z huggingface.co i spróbuj ponownie — pobieranie wznowi się od miejsca przerwania.`)
      await new Promise((r) => setTimeout(r, 2000 * attempt))
    }
  }
  const resumed = res.status === 206
  if (!resumed) have = 0
  const total = (Number(res.headers.get('content-length')) || 0) + have
  let done = have
  let last = 0
  const body = Readable.fromWeb(res.body)
  body.on('data', (chunk) => {
    done += chunk.length
    const now = Date.now()
    if (now - last > 400) {
      last = now
      onProgress?.(done, total)
    }
  })
  try {
    await pipeline(body, fs.createWriteStream(tmp, { flags: resumed ? 'a' : 'w' }))
  } catch (err) {
    throw new Error(`Przerwano pobieranie ${path.basename(dest)} (${err.message}). Kliknij „Spróbuj ponownie” — pobieranie wznowi się od ${mb(done)}.`)
  }
  if (total && done < total) throw new Error(`Pobrano tylko ${mb(done)} z ${mb(total)} pliku ${path.basename(dest)}. Spróbuj ponownie — pobieranie wznowi się.`)
  fs.renameSync(tmp, dest)
  onProgress?.(done, total || done)
}

const hf = (repo, file) => `https://huggingface.co/${repo}/resolve/main/${file}`
const mb = (n) => `${(n / 1024 / 1024).toFixed(0)} MB`

// --------------------------------------------------------------- zadania w tle

const jobs = new Map()

function startJob(kind, fn) {
  const current = jobs.get(kind)
  if (current?.status === 'running') return current
  const job = { kind, status: 'running', step: '', log: [], progress: null, error: null, startedAt: Date.now() }
  const api = {
    step(text) {
      job.step = text
      job.progress = null
      api.log(`▸ ${text}`)
    },
    log(line) {
      job.log.push(line)
      if (job.log.length > 300) job.log.splice(0, job.log.length - 300)
    },
    progress(done, total, label) {
      job.progress = { done, total, pct: total ? Math.min(100, Math.round((done / total) * 100)) : null, label }
    },
  }
  jobs.set(kind, job)
  Promise.resolve()
    .then(() => fn(api))
    .then(() => {
      job.status = 'done'
      job.progress = null
      api.log('✓ Gotowe')
    })
    .catch((err) => {
      job.status = 'error'
      job.error = err.message
      api.log(`✗ ${err.message}`)
    })
    .finally(() => (job.finishedAt = Date.now()))
  return job
}

const jobView = (j) => j && { ...j, log: j.log.slice(-80) }

// --------------------------------------------------------------- Docker

async function dockerProbe() {
  const cli = which('docker') || (isWin && exists('C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe') ? 'docker.exe' : null) || (isMac && exists('/Applications/Docker.app') ? '/Applications/Docker.app' : null)
  const st = await SB.dockerStatus()
  if (st.available) return { installed: true, running: true, version: st.version, endpoint: st.endpoint, problem: null }
  const problem = st.code === 'EACCES' || st.code === 'EPERM' ? 'permission' : cli ? 'stopped' : 'missing'
  return { installed: !!cli || problem === 'permission', running: false, version: null, problem, error: st.error }
}

const desktopExe = 'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe'
const hasDesktopLinux = () => !isWin && !isMac && exists(path.join(os.homedir(), '.docker', 'desktop'))
function linuxDistro() {
  try {
    const txt = fs.readFileSync('/etc/os-release', 'utf8')
    const get = (k) => txt.match(new RegExp(`^${k}="?([^"\\n]*)`, 'm'))?.[1] || ''
    return { id: get('ID'), like: get('ID_LIKE') }
  } catch {
    return { id: '', like: '' }
  }
}
// Distra obsługiwane przez https://get.docker.com
const GET_DOCKER = /\b(ubuntu|debian|raspbian|fedora|centos|rhel|sles|rocky|almalinux|linuxmint|pop|elementary|zorin|kali)\b/
const graphicalSudo = () => !isWin && !isMac && which('pkexec') && (process.env.DISPLAY || process.env.WAYLAND_DISPLAY)

function dockerHelp(probe) {
  const user = os.userInfo().username
  if (isWin) {
    return {
      autoInstall: !!which('winget'),
      autoStart: exists(desktopExe),
      install: ['winget install -e --id Docker.DockerDesktop'],
      start: ['Uruchom „Docker Desktop” z menu Start i poczekaj, aż ikona wieloryba przestanie migać.'],
      link: 'https://docs.docker.com/desktop/setup/install/windows-install/',
    }
  }
  if (isMac) {
    return {
      autoInstall: !!which('brew'),
      autoStart: exists('/Applications/Docker.app'),
      install: ['brew install --cask docker'],
      start: ['open -a Docker'],
      link: 'https://docs.docker.com/desktop/setup/install/mac-install/',
    }
  }
  const distro = linuxDistro()
  const arch = /\b(arch|manjaro|endeavouros)\b/.test(`${distro.id} ${distro.like}`)
  const supported = GET_DOCKER.test(`${distro.id} ${distro.like}`)
  return {
    autoInstall: !!(supported && graphicalSudo() && which('curl')),
    autoStart: !!(graphicalSudo() || hasDesktopLinux()),
    install: arch
      ? ['sudo pacman -S docker', `sudo usermod -aG docker ${user}`, 'sudo systemctl enable --now docker']
      : ['curl -fsSL https://get.docker.com | sudo sh', `sudo usermod -aG docker ${user}`, 'sudo systemctl enable --now docker'],
    start: hasDesktopLinux() ? ['systemctl --user start docker-desktop'] : ['sudo systemctl start docker'],
    permission: [`sudo usermod -aG docker ${user}`, 'Wyloguj się i zaloguj ponownie (albo uruchom ponownie komputer), potem uruchom DevLingo jeszcze raz.'],
    link: 'https://docs.docker.com/engine/install/',
    problem: probe.problem,
  }
}

async function waitForDocker(job, seconds = 120) {
  for (let i = 0; i < seconds / 2; i++) {
    const p = await dockerProbe()
    if (p.running) return p
    if (p.problem === 'permission') {
      throw new Error('Docker działa, ale Twoje konto nie ma do niego dostępu. Wyloguj się i zaloguj ponownie (grupa „docker”), potem uruchom DevLingo jeszcze raz.')
    }
    if (i % 5 === 0) job.log('Czekam, aż Docker wystartuje…')
    await new Promise((r) => setTimeout(r, 2000))
  }
  throw new Error('Docker nie wystartował w ciągu 2 minut. Uruchom go ręcznie i kliknij „Sprawdź ponownie”.')
}

async function installDocker(job) {
  const onLine = (l) => job.log(l)
  if (isWin) {
    job.step('Instaluję Docker Desktop przez winget (potwierdź okno uprawnień)')
    await run('winget', ['install', '-e', '--id', 'Docker.DockerDesktop', '--accept-package-agreements', '--accept-source-agreements'], { onLine })
    job.log('Docker Desktop zainstalowany. Może być wymagane ponowne uruchomienie Windows (WSL 2).')
    await startDocker(job)
    return
  }
  if (isMac) {
    job.step('Instaluję Docker Desktop przez Homebrew')
    await run('brew', ['install', '--cask', 'docker'], { onLine })
    await startDocker(job)
    return
  }
  if (!graphicalSudo()) throw new Error('Automatyczna instalacja wymaga pkexec i sesji graficznej. Wykonaj polecenia z instrukcji w terminalu.')
  const user = os.userInfo().username
  job.step('Instaluję Docker Engine (oficjalny skrypt get.docker.com) — podaj hasło administratora')
  await run('pkexec', ['sh', '-c', `curl -fsSL https://get.docker.com | sh && systemctl enable --now docker && usermod -aG docker ${user}`], { onLine })
  job.log(`Dodano użytkownika ${user} do grupy „docker”.`)
  const p = await dockerProbe()
  if (p.problem === 'permission') {
    throw new Error('Docker jest zainstalowany. Żeby działał bez sudo, wyloguj się i zaloguj ponownie, a potem uruchom DevLingo jeszcze raz.')
  }
  await waitForDocker(job)
}

async function startDocker(job) {
  job.step('Uruchamiam Docker')
  if (isWin) spawn(desktopExe, [], { detached: true, stdio: 'ignore' }).unref()
  else if (isMac) await run('open', ['-a', 'Docker'])
  else if (hasDesktopLinux()) await run('systemctl', ['--user', 'start', 'docker-desktop'], { onLine: (l) => job.log(l) })
  else if (graphicalSudo()) await run('pkexec', ['systemctl', 'start', 'docker'], { onLine: (l) => job.log(l) })
  else throw new Error('Uruchom Docker ręcznie: sudo systemctl start docker')
  await waitForDocker(job)
}

// --------------------------------------------------------------- głos (ZONOS3-Mini)

let voiceCache = { at: 0, ok: false }

export async function voiceServerUp(force = false) {
  if (!force && Date.now() - voiceCache.at < 15_000) return voiceCache.ok
  let ok = false
  try {
    const r = await fetch(new URL('/v2/capabilities', ZONOS_URL), { signal: AbortSignal.timeout(1500) })
    ok = r.ok
  } catch {}
  voiceCache = { at: Date.now(), ok }
  return ok
}

function voiceFiles(P) {
  return ZONOS_FILES.map((f) => path.join(P.zonosModels, path.basename(f)))
}

async function extractFromImage(image, srcDir, destDir) {
  const container = await SB.docker.createContainer({ Image: image, Entrypoint: ['true'] })
  try {
    const archive = await container.getArchive({ path: srcDir })
    const extract = tar.extract()
    const base = path.basename(srcDir)
    fs.mkdirSync(destDir, { recursive: true })
    await new Promise((resolve, reject) => {
      extract.on('entry', (header, stream, next) => {
        const rel = header.name.split('/').slice(1).join('/')
        const out = path.resolve(destDir, rel)
        if (header.type !== 'file' || !rel || !out.startsWith(path.resolve(destDir) + path.sep) || !header.name.startsWith(base)) {
          stream.resume()
          return stream.on('end', next)
        }
        fs.mkdirSync(path.dirname(out), { recursive: true })
        stream.pipe(fs.createWriteStream(out)).on('finish', next).on('error', reject)
      })
      extract.on('finish', resolve)
      extract.on('error', reject)
      archive.pipe(extract)
    })
  } finally {
    await container.remove({ force: true }).catch(() => {})
  }
}

async function buildZonosImage(P, job) {
  if (await SB.imageExists(ZONOS_IMAGE)) return job.log('Obraz serwera głosu już jest.')
  job.step('Buduję serwer głosu w Dockerze (jednorazowo, zwykle 5–20 min)')
  const pack = tar.pack()
  pack.entry({ name: 'Dockerfile' }, fs.readFileSync(path.join(P.zonosContext, 'Dockerfile'), 'utf8'))
  pack.finalize()
  const stream = await SB.docker.buildImage(pack, { t: ZONOS_IMAGE, labels: { 'devlingo.voice': '1' } })
  await new Promise((resolve, reject) => {
    SB.docker.modem.followProgress(
      stream,
      (err, out) => {
        const failed = err || out?.find((o) => o.error)
        failed ? reject(new Error(err?.message || failed.error)) : resolve()
      },
      (ev) => {
        const line = (ev.stream || ev.status || '').trim()
        if (line) job.log(line.slice(0, 200))
      },
    )
  })
}

function portFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer()
    srv.once('error', () => resolve(false))
    srv.listen(port, '127.0.0.1', () => srv.close(() => resolve(true)))
  })
}

async function ensureZonosContainer(P, job) {
  const c = SB.docker.getContainer(ZONOS_CONTAINER)
  let info = null
  try {
    info = await c.inspect()
  } catch {}
  if (info && info.Config?.Image !== ZONOS_IMAGE && (await voiceServerUp(true))) {
    return job.log(`Kontener ${ZONOS_CONTAINER} już działa (własna konfiguracja) — zostawiam go.`)
  }
  if (info && info.Config?.Image !== ZONOS_IMAGE) {
    throw new Error(`Istnieje kontener „${ZONOS_CONTAINER}” z innego obrazu. Usuń go (docker rm -f ${ZONOS_CONTAINER}) i spróbuj ponownie.`)
  }
  const port = new URL(ZONOS_URL).port || '1919'
  if (!info?.State?.Running && !(await portFree(Number(port)))) {
    throw new Error(`Port ${port} jest zajęty przez inny program, więc serwer głosu nie może wystartować. Zamknij ten program albo uruchom DevLingo z innym adresem, np. ZONOS_URL=http://127.0.0.1:1920 npm start.`)
  }
  if (!info) {
    job.step('Tworzę kontener serwera głosu')
    const threads = Math.max(2, Math.min(6, os.cpus().length - 2))
    await SB.docker.createContainer({
      name: ZONOS_CONTAINER,
      Image: ZONOS_IMAGE,
      Cmd: ['/models/backbone-ptq-edit.gguf', '--cpu', '--host', '0.0.0.0', '--port', '1919', '--batch', '1', '--zac-threads', '1'],
      Env: [`OMP_NUM_THREADS=${threads}`],
      ExposedPorts: { '1919/tcp': {} },
      Labels: { 'devlingo.voice': '1' },
      HostConfig: {
        Mounts: [{ Type: 'bind', Source: P.zonosModels, Target: '/models', ReadOnly: true }],
        PortBindings: { '1919/tcp': [{ HostIp: '127.0.0.1', HostPort: port }] },
        RestartPolicy: { Name: 'unless-stopped' },
      },
    })
  }
  if (!info?.State?.Running) {
    job.step('Uruchamiam serwer głosu')
    await c.start().catch((err) => {
      if (!/already started/i.test(err.message)) throw err
    })
  }
}

async function installVoice(P, job) {
  const d = await dockerProbe()
  if (!d.running) throw new Error('Głos AI działa w Dockerze — najpierw uruchom Dockera.')

  for (const [i, file] of ZONOS_FILES.entries()) {
    const dest = path.join(P.zonosModels, path.basename(file))
    if (exists(dest)) {
      job.log(`${path.basename(file)} — już pobrany`)
      continue
    }
    job.step(`Pobieram model głosu (${i + 1}/${ZONOS_FILES.length}): ${path.basename(file)}`)
    await download(hf('Zyphra/ZONOS3-Mini', file), dest, (done, total) => job.progress(done, total, `${mb(done)} / ${total ? mb(total) : '?'}`))
  }

  await buildZonosImage(P, job)

  if (!exists(P.zonosVoices) || !fs.readdirSync(P.zonosVoices).length) {
    job.step('Kopiuję próbki głosów do projektowania')
    await extractFromImage(ZONOS_IMAGE, '/opt/voices', P.zonosVoices)
  }

  await ensureZonosContainer(P, job)

  job.step('Czekam, aż model głosu się załaduje')
  for (let i = 0; i < 90; i++) {
    if (await voiceServerUp(true)) break
    if (i === 89) throw new Error('Serwer głosu nie odpowiada. Sprawdź: docker logs devlingo-zonos')
    await new Promise((r) => setTimeout(r, 2000))
  }
  job.log(`Serwer głosu działa na ${ZONOS_URL}. Uruchamia się sam razem z Dockerem.`)
}

async function removeVoiceContainer(job) {
  job.step('Zatrzymuję serwer głosu')
  const c = SB.docker.getContainer(ZONOS_CONTAINER)
  const info = await c.inspect().catch(() => null)
  if (!info) return job.log('Kontener nie istnieje.')
  if (info.Config?.Image !== ZONOS_IMAGE) throw new Error('Ten kontener nie został utworzony przez DevLingo — zatrzymaj go ręcznie.')
  await c.remove({ force: true })
  voiceCache.at = 0
  job.log('Kontener usunięty. Pobrane modele zostały w data/zonos/models.')
}

// --------------------------------------------------------------- dyktowanie (Faster Whisper)

// Faster Whisper + av mają gotowe paczki (wheels) dla Pythona 3.10–3.13. Na nowszym pip
// spróbowałby kompilacji, która zwykle się nie udaje, więc wolimy starszą wersję, jeśli jest.
const PY_MIN = [3, 10]
const PY_MAX_TESTED = [3, 13]

function pythonCandidates() {
  const minors = [13, 12, 11, 10, 14]
  if (isWin) return [...minors.map((m) => ['py', [`-3.${m}`]]), ['py', ['-3']], ['python', []], ['python3', []]]
  return [...minors.map((m) => [`python3.${m}`, []]), ['python3', []], ['python', []]]
}

const cmpVer = (a, b) => a[0] - b[0] || a[1] - b[1]

function findPython() {
  const found = []
  for (const [cmd, pre] of pythonCandidates()) {
    try {
      const v = execFileSync(cmd, [...pre, '-c', 'import sys;print("%d.%d" % sys.version_info[:2])'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true, timeout: 5000 }).trim()
      const ver = v.split('.').map(Number)
      if (ver[0] === 3 && cmpVer(ver, PY_MIN) >= 0) found.push({ cmd, pre, version: v, ver, tested: cmpVer(ver, PY_MAX_TESTED) <= 0 })
    } catch {}
  }
  // Najnowsza przetestowana wersja, a jeśli takiej nie ma — cokolwiek ≥ 3.10.
  found.sort((a, b) => (b.tested - a.tested) || cmpVer(b.ver, a.ver))
  return found[0] || null
}

function dictationInstalled(P) {
  return exists(P.whisperPython) && exists(path.join(P.whisperModel, 'model.bin'))
}

async function installDictation(P, job) {
  const onLine = (l) => job.log(l)
  if (!exists(P.whisperPython)) {
    const py = findPython()
    if (!py) throw new Error('Nie znaleziono Pythona 3.10+. Zainstaluj Pythona 3.12 lub 3.13 (https://www.python.org/downloads/) i spróbuj ponownie.')
    if (!py.tested) job.log(`Uwaga: Python ${py.version} jest nowszy niż sprawdzone 3.10–3.13. Jeśli instalacja się nie uda, zainstaluj Pythona 3.12 lub 3.13.`)
    job.step(`Tworzę środowisko Pythona ${py.version}`)
    try {
      await run(py.cmd, [...py.pre, '-m', 'venv', P.whisperVenv], { onLine })
    } catch {
      // Debian/Ubuntu bez python3-venv: tworzymy venv bez pip i doinstalowujemy go niżej.
      fs.rmSync(P.whisperVenv, { recursive: true, force: true })
      job.log('Brak ensurepip — tworzę środowisko bez pip.')
      try {
        await run(py.cmd, [...py.pre, '-m', 'venv', '--without-pip', P.whisperVenv], { onLine })
      } catch (err) {
        fs.rmSync(P.whisperVenv, { recursive: true, force: true })
        throw new Error(!isWin && !isMac ? `Nie udało się utworzyć venv. Doinstaluj: sudo apt install python3-venv\n${err.message}` : err.message)
      }
    }
  }
  const has = (code) => run(P.whisperPython, ['-c', code]).then(() => true, () => false)
  if (await has('import faster_whisper')) {
    job.log('Faster Whisper jest już zainstalowany.')
  } else {
    if (!(await has('import pip'))) {
      job.step('Doinstalowuję pip w środowisku Pythona')
      try {
        await run(P.whisperPython, ['-m', 'ensurepip', '--upgrade'], { onLine })
      } catch {
        const getPip = path.join(P.whisperVenv, 'get-pip.py')
        await download('https://bootstrap.pypa.io/get-pip.py', getPip)
        await run(P.whisperPython, [getPip, '--disable-pip-version-check'], { onLine })
      }
    }
    job.step('Instaluję Faster Whisper (pip)')
    try {
      await run(P.whisperPython, ['-m', 'pip', 'install', '--disable-pip-version-check', '--prefer-binary', '-r', P.whisperRequirements], { onLine })
    } catch (err) {
      throw new Error(`Instalacja pakietów Whisper nie powiodła się. Najczęstsza przyczyna: brak gotowych paczek dla Twojej wersji Pythona — zainstaluj Pythona 3.12 lub 3.13, usuń katalog data/whisper/venv i spróbuj ponownie.\n${err.message.slice(-400)}`)
    }
  }

  for (const [i, file] of WHISPER_FILES.entries()) {
    const dest = path.join(P.whisperModel, file)
    if (exists(dest)) continue
    job.step(`Pobieram model rozpoznawania mowy (${i + 1}/${WHISPER_FILES.length}): ${file}`)
    await download(hf('Systran/faster-whisper-small', file), dest, (done, total) => job.progress(done, total, `${mb(done)} / ${total ? mb(total) : '?'}`))
  }
  job.step('Sprawdzam instalację')
  await run(P.whisperPython, ['-c', 'import faster_whisper; print("faster-whisper", faster_whisper.__version__)'], { onLine })
}

// --------------------------------------------------------------- obrazy piaskownicy

async function sandboxImages() {
  const out = {}
  for (const [lang, env] of Object.entries(SB.ENVS)) {
    if (lang === 'c') continue
    out[lang] = { label: env.label, image: env.image, ready: await SB.imageExists(env.image) }
  }
  return out
}

async function buildSandboxImages(languages, job) {
  const d = await dockerProbe()
  if (!d.running) throw new Error('Docker nie działa.')
  const list = languages.filter((l) => SB.envFor(l))
  for (const [i, lang] of list.entries()) {
    job.step(`Przygotowuję środowisko ${SB.envFor(lang).label} (${i + 1}/${list.length})`)
    job.progress(i, list.length, `${i} / ${list.length}`)
    await SB.ensureImage(lang, (l) => job.log(l))
  }
}

// --------------------------------------------------------------- API

export function registerSetup(app, root) {
  const P = paths(root)

  app.get('/api/setup/status', async (_req, res) => {
    const s = readState().settings
    const [docker, claude, codex, claudeAuth, codexAuth, voiceUp] = await Promise.all([
      dockerProbe(),
      providerStatus('claude', s.claudeBin),
      providerStatus('codex', s.codexBin),
      providerAuth('claude', s.claudeBin),
      providerAuth('codex', s.codexBin),
      voiceServerUp(true),
    ])
    const py = findPython()
    res.json({
      platform: process.platform,
      docker: { ...docker, help: dockerHelp(docker) },
      providers: {
        claude: { ...claude, auth: claude.available ? claudeAuth : null, install: isWin ? 'irm https://claude.ai/install.ps1 | iex' : 'curl -fsSL https://claude.ai/install.sh | bash', login: 'claude auth login' },
        codex: { ...codex, auth: codex.available ? codexAuth : null, install: 'npm install -g @openai/codex', login: 'codex login' },
      },
      voice: {
        running: voiceUp,
        modelsReady: voiceFiles(P).every(exists),
        imageReady: docker.running ? await SB.imageExists(ZONOS_IMAGE) : false,
        downloadMB: 1700,
      },
      dictation: { installed: dictationInstalled(P), python: py?.version || null, pythonTested: !!py?.tested, downloadMB: 560 },
      sandbox: docker.running ? await sandboxImages() : null,
      jobs: Object.fromEntries([...jobs].map(([k, j]) => [k, jobView(j)])),
    })
  })

  app.get('/api/setup/jobs', (_req, res) => {
    res.set('Cache-Control', 'no-store').json(Object.fromEntries([...jobs].map(([k, j]) => [k, jobView(j)])))
  })

  const KINDS = {
    'docker-install': () => (job) => installDocker(job),
    'docker-start': () => (job) => startDocker(job),
    voice: () => (job) => installVoice(P, job),
    'voice-remove': () => (job) => removeVoiceContainer(job),
    dictation: () => (job) => installDictation(P, job),
    sandbox: (body) => {
      const languages = Array.isArray(body?.languages) ? body.languages.map(String) : []
      if (!languages.length) throw new Error('Wybierz co najmniej jeden język.')
      return (job) => buildSandboxImages(languages, job)
    },
  }

  app.post('/api/setup/jobs/:kind', (req, res) => {
    const make = KINDS[req.params.kind]
    if (!make) return res.status(404).json({ error: 'Nieznane zadanie' })
    let fn
    try {
      fn = make(req.body)
    } catch (err) {
      return res.status(400).json({ error: err.message })
    }
    res.json(jobView(startJob(req.params.kind, fn)))
  })

  app.get('/api/providers/:id/models', async (req, res) => {
    const id = req.params.id
    if (id !== 'claude' && id !== 'codex') return res.status(404).json({ error: 'Nieznany dostawca' })
    const s = readState().settings
    res.json(await providerModels(id, id === 'codex' ? s.codexBin : s.claudeBin))
  })

  app.post('/api/setup/refresh', async (_req, res) => {
    clearProviderCaches()
    voiceCache.at = 0
    await SB.reconnectDocker().catch(() => {})
    res.json({ ok: true })
  })

}

export async function features(root) {
  const P = paths(root)
  return { speech: await voiceServerUp(), dictation: dictationInstalled(P) }
}
