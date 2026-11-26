// Packs a block plugin folder into a .thinkling file that users install from the
// Extensions screen. Usage: npm run plugin:pack -- <plugin-folder> [output-file]
import { zipSync } from 'fflate'
import fs from 'node:fs'
import path from 'node:path'

const [folder, output] = process.argv.slice(2)
if (!folder) {
  console.error('Usage: npm run plugin:pack -- <plugin-folder> [output-file]')
  process.exit(1)
}

const root = path.resolve(folder)
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'))
const files = {}
for (const entry of fs.readdirSync(root, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile()) continue
  const file = path.join(entry.parentPath, entry.name)
  const name = path.relative(root, file).split(path.sep).join('/')
  // Hidden files are not part of a plugin.
  if (name.split('/').some((part) => part.startsWith('.'))) continue
  files[name] = fs.readFileSync(file)
}

const target = path.resolve(output ?? `${manifest.id.replace('/', '.')}-${manifest.version}.thinkling`)
fs.writeFileSync(target, zipSync(files, { level: 9 }))
console.log(`${manifest.id} ${manifest.version} -> ${target} (${Object.keys(files).length} files)`)
