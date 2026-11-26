import { arr, int, namedValue, obj, str } from '../schema.ts'
import type { BlockSpec } from '../schema.ts'

export const spec: BlockSpec = {
  id: 'state-inspector',
  version: '1.0.0',
  engine: '^1.0.0',
  summary: 'Step-by-step view of a changing call stack, queue, list, routing table or set of registers.',
  schema: {
    instruction: str,
    code: str,
    label: str,
    layout: { type: 'string', enum: ['stack', 'queue', 'list'] },
    steps: arr(obj({ line: int, say: str, items: arr(obj({ label: str, status: str, details: arr(namedValue) })) })),
  },
  instructions: 'a changing call stack, queue, list, routing table or set of registers. "label" names the structure. "layout" is "stack", "queue" or "list". The last stack entry is active. Provide 3–8 "steps", each with "line" (0 without code), "say" and full "items" after the step starting from the bottom of the stack or front of the queue. Items have {label, status, details}; "details" contains [{name, value}]. Visualization "code" is optional. Set the card\'s main "code" to "".',
}
