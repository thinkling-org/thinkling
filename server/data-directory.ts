import path from 'node:path'
import { PROJECT_ROOT } from './project-path.ts'

export function dataDirectory(root = PROJECT_ROOT) {
  // Keep existing launch scripts working after the product rename.
  return process.env.THINKLING_DATA || process.env.CODENOMS_DATA || path.join(root, 'data')
}
