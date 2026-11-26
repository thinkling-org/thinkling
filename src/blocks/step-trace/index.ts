import StepTrace from './StepTrace.vue'
import { formatPairs, lineCount, list, numbered, pairs, validLine, hasText } from '../helpers.ts'
import type { BlockDefinition } from '../types.ts'
import { vueBlock } from '../vue-block.ts'
import { catalogs } from './messages.ts'
import { spec } from './spec.ts'

export const block: BlockDefinition = {
  ...spec,
  mount: vueBlock(StepTrace),
  locales: catalogs,
  ownsCode: () => true,

  normalize({ instruction, code, steps }) {
    const count = lineCount(code)
    if (!count) return null
    const valid = list(steps)
      .filter((step) => validLine(step?.line, count) && hasText(step.say))
      .map((step) => ({ line: step.line, say: step.say, variables: pairs(step.variables), output: step.output || '' }))
    return valid.length >= 2 ? { type: 'step-trace', instruction: instruction || '', code, steps: valid } : null
  },

  describe: (visualization) =>
    `Step-by-step trace:\n${visualization.code}\n${numbered(visualization.steps, (s) => `line ${s.line}: ${s.say}${s.variables.length ? ` (${formatPairs(s.variables)})` : ''}`)}`,
}
