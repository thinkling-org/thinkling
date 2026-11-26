import './check-node.ts'
import { startServer } from './app.ts'
import { DB_PATH } from './store.ts'

const server = await startServer({
  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT) || 3141,
})

console.log(`\n  Thinkling API → http://localhost:${server.port}`)
console.log(`  Dane: ${DB_PATH}`)
if (server.hasFrontend) console.log(`  Aplikacja → http://localhost:${server.port}\n`)

let stopping = false
async function shutdown() {
  if (stopping) return
  stopping = true
  await server.close()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
