import { arr, int, obj, str } from '../schema.ts'
import type { BlockSpec } from '../schema.ts'

export const spec: BlockSpec = {
  id: 'step-ordering',
  version: '1.1.0',
  engine: '^1.1.0',
  summary: 'The learner arranges the steps of an algorithm, procedure or configuration in the correct order.',
  schema: {
    instruction: str,
    steps: arr(obj({ text: str, indent: int })),
    success: str,
    hint: str,
  },
  instructions: 'the learner arranges an algorithm, procedure, or configuration. Use 3–7 distinct, short "steps" in correct order, with "indent" in 0–2. The app shuffles them. "success" says what to notice, and "hint" helps without revealing the order.',
  exercise: {
    schema: {
      steps: arr(obj({ text: str, indent: int })),
    },
    instructions: 'the learner puts the steps of an algorithm, procedure, calculation or configuration in order. List 3–7 distinct, short "steps" in the correct order, with "indent" in 0–2. The app shuffles them and grades the learner\'s order. Ask for the order in "prompt"; do not reveal it there or in the hints.',
  },
}
