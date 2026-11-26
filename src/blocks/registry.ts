// Renderer-side registry of lesson blocks. The server uses ./catalog.ts instead.
import { block as codeComparison } from './code-comparison/index.ts'
import { block as linearRegression } from './linear-regression/index.ts'
import { block as codeDefinitions } from './code-definitions/index.ts'
import { block as stepTrace } from './step-trace/index.ts'
import { block as stateInspector } from './state-inspector/index.ts'
import { block as valueChart } from './value-chart/index.ts'
import { block as logicCircuit } from './logic-circuit/index.ts'
import { block as stepOrdering } from './step-ordering/index.ts'
import { block as diagnosis } from './diagnosis/index.ts'
import { block as systemSim } from './system-sim/index.ts'
import { UNVERSIONED } from './catalog.ts'
import type { BlockDefinition } from './types.ts'

export { readComparisonSteps } from './code-comparison/index.ts'

const BLOCKS = new Map<string, BlockDefinition>([
  codeComparison, linearRegression, codeDefinitions, stepTrace, stateInspector,
  valueChart, logicCircuit, stepOrdering, diagnosis, systemSim,
].map((block) => [block.id, block]))

export function blockDefinition(id: string): BlockDefinition | undefined {
  return BLOCKS.get(id)
}

export function registeredBlockIds() {
  return [...BLOCKS.keys()]
}

/** Normalized visualization of a learn card, or null when absent or invalid. */
export function readLessonVisualization(exercise) {
  if (exercise?.type !== 'learn') return null
  // Older lessons stored a comparison directly on the exercise.
  const visualization = exercise.visualization ?? { type: 'code-comparison', variants: exercise.comparison }
  const block = BLOCKS.get(visualization?.type)
  if (!block) return null
  try {
    return block.normalize(visualization, { version: visualization.blockVersion ?? UNVERSIONED }) ?? null
  } catch (err) {
    // Treat a crashing normalizer like invalid data instead of breaking the lesson.
    console.error(`[block ${block.id}] normalize failed`, err)
    return null
  }
}

/** Describe a normalized visualization for the tutor chat. */
export function describeVisualization(visualization) {
  if (!visualization) return ''
  try {
    return BLOCKS.get(visualization.type)?.describe(visualization) ?? ''
  } catch (err) {
    console.error(`[block ${visualization.type}] describe failed`, err)
    return ''
  }
}
