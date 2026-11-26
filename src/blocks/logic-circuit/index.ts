import LogicCircuit from './LogicCircuit.vue'
import { compileLogic, isLogicOperator } from './expression.ts'
import { hasText, list } from '../helpers.ts'
import type { BlockDefinition } from '../types.ts'
import { spec } from './spec.ts'

export const block: BlockDefinition = {
  ...spec,
  component: LogicCircuit,

  normalize({ instruction, inputs, outputs, notes }) {
    if (!hasText(instruction)) return null
    const ids = new Set<string>()
    const validInputs = list(inputs).filter((input) => {
      const id = input?.id?.trim()
      if (!/^[A-Za-z_]\w{0,11}$/.test(id ?? '') || ids.has(id) || isLogicOperator(id)) return false
      ids.add(id)
      return true
    }).slice(0, 4).map((input) => ({ id: input.id.trim(), label: input.label || input.id, on: !!input.on }))
    if (!validInputs.length) return null
    const names = validInputs.map((input) => input.id)
    const validOutputs = list(outputs)
      .filter((output) => hasText(output?.label) && hasText(output.expression))
      .map((output) => ({ label: output.label, expression: output.expression, evaluate: compileLogic(output.expression, names) }))
      .filter((output) => output.evaluate)
      .slice(0, 5)
    if (!validOutputs.length) return null
    return {
      type: 'logic-circuit', instruction, inputs: validInputs, outputs: validOutputs,
      notes: list(notes).filter((note) => new RegExp(`^[01]{${names.length}}$`).test(note?.pattern ?? '') && hasText(note.say)),
    }
  },

  describe: (visualization) =>
    `Logic circuit. Inputs: ${visualization.inputs.map((i) => i.id).join(', ')}.\n${visualization.outputs.map((o) => `${o.label} = ${o.expression}`).join('\n')}`,
}
