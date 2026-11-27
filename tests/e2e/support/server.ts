import childProcess from 'node:child_process'
import { registerHooks, syncBuiltinESMExports } from 'node:module'
import { resolve, sep } from 'node:path'

// Keep isolation in the test process; production has no E2E switches or reset APIs.
const cliRoot = resolve(process.env.E2E_CLI_ROOT!) + sep
const originalExec = childProcess.execFileSync
const originalSpawn = childProcess.spawn
function allowed(command: string, args: readonly string[] = []) {
  return command === process.execPath && resolve(args[0] || '').startsWith(cliRoot)
}
childProcess.execFileSync = ((command, args, options) => {
  if (!allowed(String(command), args as string[])) throw new Error(`External command disabled in E2E: ${command}`)
  return originalExec(command, args, options)
}) as typeof childProcess.execFileSync
childProcess.spawn = ((command, args, options) => {
  if (!allowed(command, args as string[])) throw new Error(`External command disabled in E2E: ${command}`)
  return originalSpawn(command, args, options)
}) as typeof childProcess.spawn
syncBuiltinESMExports()

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === './docker-connect.ts') {
      return { url: new URL('./offline-docker.ts', import.meta.url).href, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
})

const { startServer } = await import('../../../server/app.ts')
const server = await startServer({ host: '127.0.0.1', port: 0 })
process.send!({ port: server.port })
let stopping = false
async function stop() {
  if (stopping) return
  stopping = true
  await server.close()
  process.exit(0)
}
process.on('message', (message) => { if (message === 'stop') void stop() })
process.on('disconnect', () => void stop())
