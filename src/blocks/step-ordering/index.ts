import StepOrdering from './StepOrdering.vue'
import { hasText, list, numbered } from '../helpers.ts'
import type { BlockDefinition } from '../types.ts'
import { spec } from './spec.ts'

export const block: BlockDefinition = {
  ...spec,
  component: StepOrdering,

  normalize({ instruction, steps, success, hint }) {
    if (!hasText(instruction)) return null
    const texts = new Set()
    const valid = list(steps).filter((step) => {
      if (!hasText(step?.text) || texts.has(step.text.trim())) return false
      texts.add(step.text.trim())
      return true
    }).map((step) => ({ text: step.text.trim(), indent: Math.max(0, Math.min(3, Number.isInteger(step.indent) ? step.indent : 0)) }))
    return valid.length >= 3 && valid.length <= 8
      ? { type: 'step-ordering', instruction, steps: valid, success: success || '', hint: hint || '' }
      : null
  },

  describe: (visualization) => `Step ordering (correct order):\n${numbered(visualization.steps, (s) => s.text)}`,
}
