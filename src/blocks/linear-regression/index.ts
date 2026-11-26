import LinearRegression from './LinearRegression.vue'
import { buildRegressionModel } from './regression.ts'
import { hasText } from '../helpers.ts'
import type { BlockDefinition } from '../types.ts'
import { vueBlock } from '../vue-block.ts'
import { catalogs } from './messages.ts'
import { spec } from './spec.ts'

export const block: BlockDefinition = {
  ...spec,
  mount: vueBlock(LinearRegression),
  locales: catalogs,

  normalize(visualization) {
    const { instruction, xLabel, yLabel, points } = visualization
    if (![instruction, xLabel, yLabel].every(hasText)) return null
    const model = buildRegressionModel(points)
    return model ? { ...visualization, model } : null
  },

  describe(visualization) {
    const points = visualization.model.data.map(({ x, y }) => [x, y])
    return `Linear regression example. X axis: ${visualization.xLabel}. Y axis: ${visualization.yLabel}.\n${visualization.instruction}\n[x, y] pairs: ${JSON.stringify(points)}`
  },
}
