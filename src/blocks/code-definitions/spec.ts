import { arr, obj, str } from '../schema.ts'
import type { BlockSpec } from '../schema.ts'

export const spec: BlockSpec = {
  id: 'code-definitions',
  summary: 'A short code snippet with explanations of unfamiliar functions, keywords, fields or symbols.',
  schema: {
    instruction: str,
    code: str,
    terms: arr(obj({ token: str, title: str, kind: str, definition: str, example: str })),
  },
  instructions: 'code has functions, keywords, fields (e.g. packet headers) or symbols the learner may not know. "code" is at most 8 lines. Each of 2–5 "terms" has the exact "token" from the code, a "title" (e.g. "Array.filter(fn)"), "kind" (e.g. "array method"), "definition" (1–2 sentences describing behavior and return value), and an "example" (1–3 lines or ""). Set the card\'s main "code" to "".',
}
