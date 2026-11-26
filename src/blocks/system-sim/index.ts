import SystemSim from './SystemSim.vue'
import { checkScenario } from './simulation.ts'
import type { BlockDefinition } from '../types.ts'
import { vueBlock } from '../vue-block.ts'
import { catalogs } from './messages.ts'
import { spec } from './spec.ts'

// Cache validation results because validation evaluates every combination of controls.
const checkedScenarios = new WeakMap()

export const block: BlockDefinition = {
  ...spec,
  mount: vueBlock(SystemSim),
  locales: catalogs,

  normalize(visualization) {
    if (!checkedScenarios.has(visualization)) {
      const { scenario, error } = checkScenario(visualization)
      if (error) console.warn(`[system-sim] odrzucony scenariusz: ${error}`)
      checkedScenarios.set(visualization, scenario ?? null)
    }
    return checkedScenarios.get(visualization)
  },

  describe(visualization) {
    const { sources, nodes, path, failures, controls, goals, solutions } = visualization
    const option = (control, k) => control.options[k].label
    return [
      `System simulation: ${visualization.instruction}`,
      `Traffic: ${sources.map((s) => `${s.label} ${s.rate}/s${s.burstEvery ? ` + ${s.burstSize}/s every ${s.burstEvery} s` : ''}`).join('; ')}`,
      `Path: ${path.map((id) => nodes.find((n) => n.id === id).label).join(' → ')}`,
      failures.length ? `Outages: ${failures.map((f) => `${f.label} (${f.from}–${f.to} s)`).join('; ')}` : '',
      `Controls:\n${controls.map((c) => `- ${c.label}: ${c.options.map((o) => o.label).join(' | ')}`).join('\n')}`,
      `Goals:\n${goals.map((g) => `- ${g.label}`).join('\n')}`,
      `Configurations that meet the goals (guide the learner without revealing them):\n${solutions.map((picks) => `- ${controls.map((c, i) => option(c, picks[i])).join(', ')}`).join('\n')}`,
    ].filter(Boolean).join('\n')
  },
}
