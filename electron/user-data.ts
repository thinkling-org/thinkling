import { existsSync } from 'node:fs'
import path from 'node:path'

/** Keep old data in place: Python environments and Docker mounts contain absolute paths. */
export function desktopUserData(appData: string, currentPath: string) {
  const preferred = path.join(appData, 'Thinkling')
  if (currentPath !== preferred || existsSync(path.join(preferred, 'data/db.json'))) return currentPath
  const legacy = path.join(appData, 'Codenoms')
  return existsSync(path.join(legacy, 'data/db.json')) ? legacy : currentPath
}
