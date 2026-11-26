// The data half of a lesson block: what the server sends to the model.
// This module and every block spec must stay free of Vue and browser APIs,
// because the server imports them. See docs/architecture/extensibility.md.

export interface BlockSpec {
  /** Stable identifier stored as `visualization.type` in lesson data. */
  id: string
  /** One sentence for the catalog the planner chooses from: what the learner sees and when it fits. */
  summary: string
  /** JSON schema properties of the block data, excluding `type`. */
  schema: Record<string, unknown>
  /** Model instructions: when to use the block and how to fill it. Continuation lines are indented by the prompt builder. */
  instructions: string
}

// Strict schemas require all fields and disallow additional properties.
// Codex requires this format. Claude accepts the same schemas unchanged.
export const str = { type: 'string' }
export const int = { type: 'integer' }
export const num = { type: 'number' }
export const bool = { type: 'boolean' }
export const arr = (items) => ({ type: 'array', items })
export const obj = (properties) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
})
export const namedValue = obj({ name: str, value: str })

/** Schema of a single block's data, tagged with its `type`. */
export function blockSchema(spec: BlockSpec) {
  return obj({ type: { type: 'string', enum: [spec.id] }, ...spec.schema })
}
