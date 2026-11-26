import { arr, num, obj, str } from '../schema.ts'
import type { BlockSpec } from '../schema.ts'

export const spec: BlockSpec = {
  id: 'linear-regression',
  version: '1.0.0',
  engine: '^1.0.0',
  summary: 'A scatter plot where the learner fits a line with a slider and watches residuals and mean squared error.',
  schema: {
    instruction: str,
    xLabel: str,
    yLabel: str,
    points: arr(obj({ x: num, y: num })),
  },
  instructions: 'fitting a line, residuals or mean squared error. Provide 5–12 numeric "points", at least two distinct x values, a meaningful trend and visible scatter. Use units in "xLabel" and "yLabel" when needed. In "instruction" ask the learner to adjust the line with the slider and watch the vertical segments. The app calculates the fit, slider positions and error. Explain what the segments mean and why smaller MSE is a better fit. Any code example must use identical points.',
}
