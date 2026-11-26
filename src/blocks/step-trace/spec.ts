import { arr, int, namedValue, obj, str } from '../schema.ts'
import type { BlockSpec } from '../schema.ts'

export const spec: BlockSpec = {
  id: 'step-trace',
  version: '1.0.0',
  engine: '^1.0.0',
  summary: 'A line-by-line execution trace with variable values and output, for when execution order matters.',
  schema: {
    instruction: str,
    code: str,
    steps: arr(obj({ line: int, say: str, variables: arr(namedValue), output: str })),
  },
  instructions: 'when execution order matters. Use 4–10 "steps", each changing one thing. "line" is 1-based. "say" explains what happens and why. "variables" is the full tracked state after the step [{name, value}], with 1–4 variables and consistent names once defined. Values are strings. "output" is all output so far or "". Set the card\'s main "code" to "".',
}
