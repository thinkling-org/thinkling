import { fileURLToPath } from 'node:url'

// Development runs the server from source. Desktop builds run it from dist-node/.
export const PROJECT_ROOT = fileURLToPath(new URL(
  import.meta.url.endsWith('.ts') ? '../' : '../../',
  import.meta.url,
))
