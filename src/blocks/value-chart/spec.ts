import { arr, num, obj, str } from '../schema.ts'
import type { BlockSpec } from '../schema.ts'

export const spec: BlockSpec = {
  id: 'value-chart',
  version: '1.0.0',
  engine: '^1.0.0',
  summary: 'A chart of one or more results against a parameter the learner sweeps, with notes at key thresholds.',
  schema: {
    instruction: str,
    xLabel: str,
    yLabel: str,
    xs: arr(num),
    series: arr(obj({ label: str, values: arr(num) })),
    yMax: num,
    notes: arr(obj({ from: num, say: str })),
  },
  instructions: 'a result that changes with one parameter. Use 8–40 increasing "xs" and 1–5 "series", each with accurately calculated "values" matching the "xs" length. "yMax" is 0 for automatic scaling or a cap when one series would flatten the others. Provide 1–3 "notes" [{from, say}] shown as x reaches their threshold. "instruction" says what to adjust and observe.',
}
