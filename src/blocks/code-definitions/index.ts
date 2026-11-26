import CodeDefinitions from './CodeDefinitions.vue'
import { hasText, list } from '../helpers.ts'
import type { BlockDefinition } from '../types.ts'
import { spec } from './spec.ts'

export const block: BlockDefinition = {
  ...spec,
  component: CodeDefinitions,
  usesCodeLanguage: true,
  ownsCode: () => true,

  normalize({ instruction, code, terms }) {
    if (!hasText(code)) return null
    const seen = new Set()
    const valid = list(terms).filter((term) => {
      if (![term?.token, term?.title, term?.definition].every(hasText)) return false
      const token = term.token.trim()
      if (seen.has(token) || !code.includes(token)) return false
      seen.add(token)
      return true
    }).map((term) => ({ ...term, token: term.token.trim(), kind: term.kind || '', example: term.example || '' }))
    return valid.length ? { type: 'code-definitions', instruction: instruction || '', code, terms: valid.slice(0, 8) } : null
  },

  describe: (visualization) =>
    `Definitions in code:\n${visualization.code}\n${visualization.terms.map((t) => `- ${t.token}: ${t.definition}`).join('\n')}`,
}
