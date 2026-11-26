import StepOrdering from './StepOrdering.vue'
import { hasText, list, numbered } from '../helpers.ts'
import type { BlockDefinition } from '../types.ts'
import { vueBlock } from '../vue-block.ts'
import { catalogs } from './messages.ts'
import { spec } from './spec.ts'

/** Share of placed steps that must be right for an "almost". */
const ALMOST = 0.6

export const block: BlockDefinition = {
  ...spec,
  mount: vueBlock(StepOrdering),
  locales: catalogs,

  normalize({ instruction, steps, success, hint }, stored) {
    // As an exercise, the task is in the exercise prompt, so the block needs no instruction of its own.
    const exercise = stored?.mode === 'exercise'
    if (!exercise && !hasText(instruction)) return null
    const texts = new Set()
    const valid = list(steps).filter((step) => {
      if (!hasText(step?.text) || texts.has(step.text.trim())) return false
      texts.add(step.text.trim())
      return true
    }).map((step) => ({ text: step.text.trim(), indent: Math.max(0, Math.min(3, Number.isInteger(step.indent) ? step.indent : 0)) }))
    return valid.length >= 3 && valid.length <= 8
      ? { type: 'step-ordering', instruction: hasText(instruction) ? instruction : '', steps: valid, success: success || '', hint: hint || '' }
      : null
  },

  describe: (visualization) => `Step ordering (correct order):\n${numbered(visualization.steps, (s) => s.text)}`,

  /** The answer is the learner's order as indices into the (correct) step list. */
  grade(data, answer, ctx) {
    const total = data.steps.length
    const order = Array.isArray(answer) ? answer : []
    const valid = order.length === total && new Set(order).size === total
      && order.every((id) => Number.isInteger(id) && id >= 0 && id < total)
    const good = valid ? order.filter((id, slot) => id === slot).length : 0
    const score = good / total
    if (good === total) return { verdict: 'correct', score: 1 }
    return {
      verdict: score >= ALMOST ? 'almost' : 'wrong',
      score,
      feedback: ctx.t('{0} of {1} steps are in the right position.', [good, total]),
    }
  },
}
