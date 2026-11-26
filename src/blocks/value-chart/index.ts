import ValueChart from './ValueChart.vue'
import { hasText, list } from '../helpers.ts'
import type { BlockDefinition } from '../types.ts'
import { vueBlock } from '../vue-block.ts'
import { catalogs } from './messages.ts'
import { spec } from './spec.ts'

export const block: BlockDefinition = {
  ...spec,
  mount: vueBlock(ValueChart),
  locales: catalogs,

  normalize({ instruction, xLabel, yLabel, xs, series, yMax, notes }) {
    if (![instruction, xLabel, yLabel].every(hasText)) return null
    const xValues = list(xs)
    if (xValues.length < 2 || !xValues.every(Number.isFinite)) return null
    if (xValues.some((x, i) => i && x <= xValues[i - 1])) return null
    const valid = list(series).filter((s) => hasText(s?.label)
      && Array.isArray(s.values) && s.values.length === xValues.length && s.values.every(Number.isFinite))
    if (!valid.length) return null
    return {
      type: 'value-chart', instruction, xLabel, yLabel, xs: xValues,
      series: valid.slice(0, 6).map(({ label, values }) => ({ label, values })),
      yMax: Number.isFinite(yMax) && yMax > 0 ? yMax : null,
      notes: list(notes).filter((note) => Number.isFinite(note?.from) && hasText(note.say))
        .sort((a, b) => a.from - b.from),
    }
  },

  describe: (visualization) =>
    `Chart of ${visualization.yLabel} versus ${visualization.xLabel}. x: ${visualization.xs.join(', ')}\n${visualization.series.map((s) => `${s.label}: ${s.values.join(', ')}`).join('\n')}`,
}
