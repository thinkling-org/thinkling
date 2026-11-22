// Importowany jako pierwszy w server/index.js: zatrzymuje start z czytelnym komunikatem,
// zanim stara wersja Node wywróci się na nieobsługiwanym API (np. AbortSignal.any).
const [major, minor] = process.versions.node.split('.').map(Number)
if (major < 20 || (major === 20 && minor < 3)) {
  console.error(`\n  Codenoms wymaga Node.js 20.3 lub nowszego (masz ${process.versions.node}).`)
  console.error('  Pobierz aktualną wersję LTS: https://nodejs.org/\n')
  process.exit(1)
}
