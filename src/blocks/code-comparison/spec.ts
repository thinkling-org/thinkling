import { arr, int, obj, str } from '../schema.ts'
import type { BlockSpec } from '../schema.ts'

export const spec: BlockSpec = {
  id: 'code-comparison',
  version: '1.0.0',
  engine: '^1.0.0',
  summary: 'Two variants of the same code side by side, stepped line by line, for when a single decision changes the outcome.',
  schema: {
    variants: arr(obj({ label: str, code: str, outcome: str, steps: arr(obj({ line: int, say: str })) })),
  },
  instructions: 'exactly two "variants" sharing the same context when a single decision changes the outcome. Each variant has a short "label", "code", a one-sentence "outcome" and 2–4 "steps". A step has a 1-based "line" and one sentence in "say" about the operation or intermediate result. Reusing a line is fine. Show the result in the final step. Introduce the example in at most two sentences in "prompt". Other explanations should complement the steps. Set the card\'s main "code" to "".',
}
