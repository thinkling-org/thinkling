import CodeComparison from './CodeComparison.vue'
import { hasText, lineCount, validLine } from '../helpers.ts'
import type { BlockDefinition } from '../types.ts'
import { vueBlock } from '../vue-block.ts'
import { catalogs } from './messages.ts'
import { spec } from './spec.ts'

/** Valid explanation steps of one variant; older lessons kept them under `trace.steps`. */
export function readComparisonSteps(variant) {
  if (!variant) return []
  const count = lineCount(variant.code)
  const validSteps = (steps) => Array.isArray(steps)
    ? steps.filter((step) => validLine(step?.line, count) && hasText(step.say))
    : []
  const steps = validSteps(variant.steps)
  return steps.length ? steps : validSteps(variant.trace?.steps)
}

export const block: BlockDefinition = {
  ...spec,
  mount: vueBlock(CodeComparison),
  locales: catalogs,
  ownsCode: () => true,

  normalize(visualization) {
    const { variants } = visualization
    return Array.isArray(variants) && variants.length === 2
      && variants.every((variant) => [variant?.label, variant?.code, variant?.outcome].every(hasText))
      ? visualization
      : null
  },

  describe: (visualization) => visualization.variants
    .map((variant) => `${variant.label}\n${variant.code}\n${variant.outcome}`).join('\n\n'),
}
