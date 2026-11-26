import { arr, bool, obj, str } from '../schema.ts'
import type { BlockSpec } from '../schema.ts'

export const spec: BlockSpec = {
  id: 'logic-circuit',
  summary: 'Interactive logic gates, Boolean conditions or switches with a computed truth table.',
  schema: {
    instruction: str,
    inputs: arr(obj({ id: str, label: str, on: bool })),
    outputs: arr(obj({ label: str, expression: str })),
    notes: arr(obj({ pattern: str, say: str })),
  },
  instructions: 'logic gates, Boolean conditions, or series and parallel switches. Use 1–4 "inputs" [{id, label, on}] with short IDs, and 1–4 "outputs" [{label, expression}]. Expressions use input IDs, parentheses and AND, OR, XOR, NOT. "notes" [{pattern, say}] describe selected configurations, with patterns as 0/1 strings in input order. The app computes the truth table.',
}
