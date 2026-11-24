// Check the Node version before loading the rest of the server.
const [major, minor] = process.versions.node.split('.').map(Number)
if (major < 24 || (major === 24 && minor < 15)) {
  console.error(`\n  Codenoms requires Node.js 24.15.0 or newer. Found ${process.versions.node}.`)
  console.error('  Download the current LTS release from https://nodejs.org/\n')
  process.exit(1)
}
