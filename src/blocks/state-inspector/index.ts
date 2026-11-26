import StateInspector from './StateInspector.vue'
import { t } from './messages.ts'
import { hasText, lineCount, list, numbered, pairs, validLine } from '../helpers.ts'
import type { BlockDefinition } from '../types.ts'
import { spec } from './spec.ts'

export const block: BlockDefinition = {
  ...spec,
  component: StateInspector,
  usesCodeLanguage: true,
  // The code listing is optional here; without it the card keeps its own example.
  ownsCode: (visualization) => !!visualization.code,

  normalize({ instruction, code, label, layout, steps }) {
    const count = lineCount(code)
    const valid = list(steps)
      .filter((step) => hasText(step?.say))
      .map((step) => ({
        line: validLine(step.line, count) ? step.line : null,
        say: step.say,
        items: list(step.items).filter((item) => hasText(item?.label)).map((item) => ({
          label: item.label, status: item.status || '', details: pairs(item.details),
        })),
      }))
    if (valid.length < 2 || !valid.some((step) => step.items.length)) return null
    return {
      type: 'state-inspector',
      instruction: instruction || '',
      code: count ? code : '',
      label: hasText(label) ? label : t('State'),
      layout: ['stack', 'queue', 'list'].includes(layout) ? layout : 'list',
      steps: valid,
    }
  },

  describe: (visualization) =>
    `State inspector (${visualization.label}):\n${visualization.code}\n${numbered(visualization.steps, (s) => `${s.say} [${s.items.map((item) => item.label).join(', ')}]`)}`,
}
