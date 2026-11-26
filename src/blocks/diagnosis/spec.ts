import { arr, bool, obj, str } from '../schema.ts'
import type { BlockSpec } from '../schema.ts'

export const spec: BlockSpec = {
  id: 'diagnosis',
  version: '1.0.0',
  engine: '^1.0.0',
  summary: 'Troubleshooting a failure: follow checks along the data path, then pick the cause.',
  schema: {
    instruction: str,
    symptom: str,
    checks: arr(obj({ name: str, detail: str, action: str, result: str, ok: bool })),
    options: arr(obj({ text: str, correct: bool, why: str })),
  },
  instructions: 'finding the cause of a failure. "symptom" is the observed problem. Use 3–6 "checks" [{name, detail, action, result, ok}] in the order of the data or current path. "action" names a check or tool, "result" reports the observation and "ok" says whether it is normal. Use 3–4 diagnosis "options", exactly one with "correct": true, each with "why" explaining which checks support or rule it out.',
}
