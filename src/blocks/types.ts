import type { Component } from 'vue'
import type { BlockSpec } from './schema.ts'

/** The code half of a lesson block. Runs in the renderer only. */
export interface BlockDefinition<Data = any> extends BlockSpec {
  /** Validate and normalize model output. Return null to reject it. */
  normalize(data: any): Data | null
  /** Plain-text description given to the tutor chat as context. */
  describe(data: Data): string
  /** Renders the normalized data, passed as the `config` prop. */
  component: Component
  /** Whether the component receives the lesson's `codeLanguage` prop. */
  usesCodeLanguage?: boolean
  /** Whether the block shows the worked example itself, so the card hides its own code listing. */
  ownsCode?(data: Data): boolean
}
