// The data half of a lesson block: what the server sends to the model.
// This module and every block spec must stay free of Vue and browser APIs,
// because the server imports them. See docs/architecture/extensibility.md.

/** Version of the block API this app implements. Blocks declare the range they support in `engine`. */
export const BLOCK_API_VERSION = '1.0.0'

/**
 * The data half of a block, which is also the manifest shape. Built-in blocks write it in
 * spec.ts; external plugins ship it as manifest.json + schema.json + instructions.md.
 */
export interface BlockSpec {
  /** Stable identifier stored as `visualization.type` in lesson data. */
  id: string
  /** Semantic version of the block. Stored with lesson data so normalize can migrate older shapes. */
  version: string
  /** Supported block API range, e.g. "^1.0.0". */
  engine: string
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
