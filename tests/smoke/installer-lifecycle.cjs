// Windows-only, isolated real install -> update -> relaunch regression test.
// Uses a separate application identity and a local HTTP feed; never touches the user's Thinkling installation.
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const { spawn } = require('node:child_process')
const assert = require('node:assert/strict')
const { setTimeout: delay } = require('node:timers/promises')

if (process.platform !== 'win32') { console.log('SKIP: installer lifecycle requires Windows'); process.exit(0) }
const root = path.resolve(__dirname, '../..')
const work = fs.mkdtempSync(path.join(root, 'release/installer-lifecycle-'))
const installed = path.join(work, 'installed')
const profile = path.join(work, 'profile')
const events = path.join(work, 'events.jsonl')
const command = path.join(work, 'update')
const log = path.join(work, 'process.log')
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
let server

function run(file, args, timeout = 180_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout.on('data', data => fs.appendFileSync(log, data))
    child.stderr.on('data', data => fs.appendFileSync(log, data))
    const deadline = setTimeout(() => { child.kill(); reject(new Error(`Timed out: ${file}`)) }, timeout)
    child.on('error', error => { clearTimeout(deadline); reject(error) })
    child.on('exit', code => {
      clearTimeout(deadline)
      code === 0 ? resolve() : reject(new Error(`${file} exited with ${code}; see ${log}`))
    })
  })
}
function readEvents() {
  return fs.existsSync(events) ? fs.readFileSync(events, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : []
}
async function waitFor(test, description, timeout = 60_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const rows = readEvents()
    const failure = rows.find(row => row.event === 'error' || row.event === 'lock-failed')
    if (failure) throw new Error(JSON.stringify(failure))
    if (test(rows)) return rows
    await delay(250)
  }
  throw new Error(`Timed out: ${description}; events: ${JSON.stringify(readEvents())}; log: ${log}`)
}

async function main() {
  const feed = path.join(work, 'v2/out')
  server = http.createServer((request, response) => {
    const name = path.basename(new URL(request.url, 'http://localhost').pathname)
    const file = path.join(feed, name)
    if (!name || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404); return response.end() }
    response.writeHead(200, { 'Content-Length': fs.statSync(file).size })
    fs.createReadStream(file).pipe(response)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}`
  for (const [folder, version] of [['v1', '0.0.1'], ['v2', '0.0.2']]) {
    const project = path.join(work, folder)
    fs.mkdirSync(project)
    fs.copyFileSync(path.join(root, 'tests/fixtures/installer-app/main.cjs'), path.join(project, 'main.cjs'))
    fs.writeFileSync(path.join(project, 'probe-config.json'), JSON.stringify({ projectRoot: root, profile, events, command }))
    fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({
      name: 'thinkling-lifecycle-test', version, main: 'main.cjs', description: 'Isolated Thinkling installer regression test',
      build: {
        appId: 'org.thinkling.installer-lifecycle-test', productName: 'Thinkling Lifecycle Test',
        electronVersion: require(path.join(root, 'package.json')).devDependencies.electron,
        npmRebuild: false, files: ['main.cjs', 'probe-config.json'], artifactName: 'lifecycle-${version}.exe',
        directories: { output: 'out', buildResources: path.join(root, 'build') },
        publish: { provider: 'generic', url },
        win: { target: 'nsis' },
        nsis: { ...require(path.join(root, 'package.json')).build.nsis, include: path.join(root, 'build/installer.nsh'), allowElevation: false, createDesktopShortcut: false, createStartMenuShortcut: false },
      },
    }, null, 2))
    console.log(`Building installer lifecycle fixture ${version}`)
    await run(process.execPath, [path.join(root, 'node_modules/electron-builder/cli.js'), '--projectDir', project, '--win', '--x64', '--publish', 'never'])
  }
  console.log('Installing fixture 0.0.1 and checking automatic launch')
  // Use the normal one-click finish path for a fresh install. The update below uses /S --force-run.
  await run(path.join(work, 'v1/out/lifecycle-0.0.1.exe'), ['/currentuser', `/D=${installed}`], 90_000)
  await waitFor(rows => rows.some(row => row.event === 'launched' && row.version === '0.0.1'), 'fresh install automatic launch')
  fs.writeFileSync(command, 'update')
  const rows = await waitFor(rows => rows.some(row => row.event === 'shutdown' && row.version === '0.0.2'), 'real updater install and automatic relaunch', 90_000)
  const relaunched = rows.find(row => row.event === 'launched' && row.version === '0.0.2')
  assert.equal(relaunched.xp, 456)
  assert.ok(relaunched.argv.includes('--updated'))
  const savedIndex = rows.findIndex(row => row.event === 'saved')
  assert.ok(savedIndex >= 0 && savedIndex < rows.indexOf(relaunched))
  console.log('PASS: fresh NSIS install launched the app; real quitAndInstall updated and relaunched it with saved data')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  server?.closeAllConnections()
  server?.close()
  const uninstaller = path.join(installed, 'Uninstall Thinkling Lifecycle Test.exe')
  if (fs.existsSync(uninstaller)) {
    await delay(1_000)
    try {
      await run(uninstaller, ['/S', '/currentuser'], 30_000)
      for (let i = 0; i < 60 && fs.existsSync(path.join(installed, 'Thinkling Lifecycle Test.exe')); i++) await delay(250)
      assert.ok(!fs.existsSync(path.join(installed, 'Thinkling Lifecycle Test.exe')), 'Test app was not uninstalled')
    } catch (error) { console.error('Test app cleanup:', error.message); process.exitCode = 1 }
  }
})
