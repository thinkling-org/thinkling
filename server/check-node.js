// Check the Node version before loading modules that require newer APIs such as AbortSignal.any.
const [major, minor] = process.versions.node.split('.').map(Number)
if (major < 20 || (major === 20 && minor < 3)) {
  console.error(`\n  Codenoms requires Node.js 20.3 or newer. Found ${process.versions.node}.`)
  console.error('  Download the current LTS release from https://nodejs.org/\n')
  process.exit(1)
}
