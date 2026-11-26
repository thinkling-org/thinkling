// Specs of the built-in blocks, in the order the model sees them.
// Server-safe: no Vue or browser code may be imported from here.
import { spec as codeComparison } from './code-comparison/spec.ts'
import { spec as linearRegression } from './linear-regression/spec.ts'
import { spec as codeDefinitions } from './code-definitions/spec.ts'
import { spec as stepTrace } from './step-trace/spec.ts'
import { spec as stateInspector } from './state-inspector/spec.ts'
import { spec as valueChart } from './value-chart/spec.ts'
import { spec as logicCircuit } from './logic-circuit/spec.ts'
import { spec as stepOrdering } from './step-ordering/spec.ts'
import { spec as diagnosis } from './diagnosis/spec.ts'
import { spec as systemSim } from './system-sim/spec.ts'
import { blockSchema } from './schema.ts'
import type { BlockSpec } from './schema.ts'

export const BLOCK_SPECS: readonly BlockSpec[] = [
  codeComparison, linearRegression, codeDefinitions, stepTrace, stateInspector,
  valueChart, logicCircuit, stepOrdering, diagnosis, systemSim,
]

export const BLOCK_IDS = BLOCK_SPECS.map((spec) => spec.id)

/** Stored data written before blocks were versioned counts as the first version. */
export const UNVERSIONED = '1.0.0'

/** Record which block version produced the data, so a later version can migrate it. */
export function stampBlockVersion<T extends { type?: unknown }>(visualization: T): T & { blockVersion?: string } {
  const spec = BLOCK_SPECS.find((candidate) => candidate.id === visualization?.type)
  return spec ? { ...visualization, blockVersion: spec.version } : visualization
}

/**
 * Blocks the lesson generator may use, in catalog order, out of the available ones
 * (built-in plus installed plugins). Lessons from plans made before the planner chose
 * blocks have no `blocks` field and get every built-in block, never plugins.
 */
export function selectBlocks(ids?: readonly string[] | null, available: readonly BlockSpec[] = BLOCK_SPECS): readonly BlockSpec[] {
  if (!Array.isArray(ids)) return BLOCK_SPECS
  return available.filter((spec) => ids.includes(spec.id))
}

/** One line per block for the planner: id and summary only, never the full spec. */
export function blockCatalog(specs: readonly BlockSpec[] = BLOCK_SPECS) {
  return specs.map(({ id, summary }) => `  - "${id}": ${summary}`).join('\n')
}

/** Schema of a learn card's `visualization`: null or one of the given blocks. */
export function visualizationSchema(specs: readonly BlockSpec[] = BLOCK_SPECS) {
  return specs.length ? { anyOf: [{ type: 'null' }, ...specs.map(blockSchema)] } : { type: 'null' }
}

/** Model instructions for the given blocks, as a nested Markdown list. */
export function visualizationInstructions(specs: readonly BlockSpec[] = BLOCK_SPECS) {
  return specs.map(({ id, instructions }) => `  - "${id}": ${instructions.replaceAll('\n', '\n    ')}`).join('\n')
}
