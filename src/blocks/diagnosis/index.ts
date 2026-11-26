import Diagnosis from './Diagnosis.vue'
import { hasText, list } from '../helpers.ts'
import type { BlockDefinition } from '../types.ts'
import { spec } from './spec.ts'

export const block: BlockDefinition = {
  ...spec,
  component: Diagnosis,

  normalize({ instruction, symptom, checks, options }) {
    if (![instruction, symptom].every(hasText)) return null
    const validChecks = list(checks)
      .filter((check) => [check?.name, check?.action, check?.result].every(hasText))
      .map((check) => ({ name: check.name, detail: check.detail || '', action: check.action, result: check.result, ok: !!check.ok }))
      .slice(0, 6)
    const validOptions = list(options)
      .filter((option) => [option?.text, option?.why].every(hasText))
      .map((option) => ({ text: option.text, why: option.why, correct: !!option.correct }))
      .slice(0, 5)
    if (validChecks.length < 2 || validOptions.length < 2 || validOptions.filter((o) => o.correct).length !== 1) return null
    return { type: 'diagnosis', instruction, symptom, checks: validChecks, options: validOptions }
  },

  describe: (visualization) =>
    `Diagnosis: ${visualization.symptom}\nChecks:\n${visualization.checks.map((c) => `- ${c.name} (${c.action}): ${c.result}`).join('\n')}\nOptions: ${visualization.options.map((o) => `${o.text}${o.correct ? ' (correct)' : ''}`).join(' | ')}`,
}
