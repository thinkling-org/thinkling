import { describe, expect, it } from 'vitest'
import { BLOCK_IDS, BLOCK_SPECS } from '../../src/blocks/catalog.ts'
import { lessonTask, planTask, refinePlanTask } from '../../server/prompts.ts'
import type { LessonKind, Plan } from '../../src/domain.ts'

const profile = { description: 'Backend developer', minutesPerDay: 20, style: 'balanced' as const }

function planWith(kind: LessonKind, blocks?: string[]): Plan {
  return {
    title: 'Plan', summary: '', goal: 'Goal', level: 'Mid', levelSummary: '', language: 'javascript',
    durationWeeks: 1, weakSpots: [], createdAt: 0,
    modules: [{
      id: 'm0', title: 'Module', week: 1, description: '',
      lessons: [{ id: 'l0', title: 'Lesson', kind, focus: 'Focus', status: 'current', ...(blocks && { blocks }) }],
    }],
  }
}

const lesson = (kind: LessonKind, blocks?: string[]) =>
  lessonTask({ profile, plan: planWith(kind, blocks), moduleIndex: 0, lessonIndex: 0, runtime: 'browser' })
const visualizationTypes = (task) => {
  const schema = task.schema.properties.exercises.items.properties.visualization
  return schema.anyOf ? schema.anyOf.slice(1).map((s) => s.properties.type.enum[0]) : []
}
const instructionsOf = (id: string) => BLOCK_SPECS.find((spec) => spec.id === id).instructions.split('\n')[0]

describe('block selection in prompts', () => {
  it('gives the planner a catalog of summaries and lets it choose known blocks only', () => {
    const task = planTask(profile)
    for (const spec of BLOCK_SPECS) {
      expect(task.prompt).toContain(`  - "${spec.id}": ${spec.summary}`)
      expect(task.prompt).not.toContain(instructionsOf(spec.id))
    }
    const lessonItem = task.schema.properties.modules.items.properties.lessons.items
    expect(lessonItem.properties.blocks).toEqual({ type: 'array', items: { type: 'string', enum: BLOCK_IDS } })
    expect(lessonItem.required).toContain('blocks')
  })

  it('sends only the chosen blocks to the lesson author', () => {
    const task = lesson('code', ['step-trace'])
    expect(visualizationTypes(task)).toEqual(['step-trace'])
    expect(task.prompt).toContain(instructionsOf('step-trace'))
    expect(task.prompt).not.toContain(instructionsOf('system-sim'))
    expect(task.prompt).not.toContain('"code-comparison"')
  })

  it('keeps every block for lessons from plans made before blocks were chosen', () => {
    const task = lesson('design')
    expect(visualizationTypes(task)).toEqual(BLOCK_IDS)
    expect(task.prompt).toContain('including system-sim where interaction helps')
  })

  it('asks for no visualization when the planner chose none', () => {
    const task = lesson('design', [])
    expect(task.schema.properties.exercises.items.properties.visualization).toEqual({ type: 'null' })
    expect(task.prompt).toContain('- Set "visualization" to null on every card.')
    expect(task.prompt).not.toContain('Use an appropriate visualization')
  })

  it('ignores block ids that are not installed', () => {
    const task = lesson('design', ['math/graph', 'diagnosis'])
    expect(visualizationTypes(task)).toEqual(['diagnosis'])
    expect(task.prompt).toContain('do not include code exercises. Use an appropriate visualization in the worked example.')
  })

  it('shows the current block choices when revising a plan', () => {
    const task = refinePlanTask({ ...profile, plan: planWith('code', ['step-trace']), feedback: 'More practice' })
    expect(task.prompt).toContain('"blocks": [\n      "step-trace"\n     ]')
  })
})
