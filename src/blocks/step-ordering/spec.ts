import { arr, int, obj, str } from '../schema.ts'
import type { BlockSpec } from '../schema.ts'

export const spec: BlockSpec = {
  id: 'step-ordering',
  summary: 'The learner arranges the steps of an algorithm, procedure or configuration in the correct order.',
  schema: {
    instruction: str,
    steps: arr(obj({ text: str, indent: int })),
    success: str,
    hint: str,
  },
  instructions: 'the learner arranges an algorithm, procedure, or configuration. Use 3–7 distinct, short "steps" in correct order, with "indent" in 0–2. The app shuffles them. "success" says what to notice, and "hint" helps without revealing the order.',
}
