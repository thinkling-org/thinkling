// The public contract between Thinkling and a lesson block (plugin API v1.1).
// See docs/architecture/extensibility.md. External plugins see only these types.
import type { MessageCatalogs } from '../lib/translation.ts'
import type { BlockSpec } from './schema.ts'

/** How a block is used: shown on a learn card, or as a task the learner does and the app grades. */
export type BlockMode = 'visualization' | 'exercise'

export type Verdict = 'correct' | 'almost' | 'wrong'

/** What grade() returns. */
export interface GradeResult {
  verdict: Verdict
  /** 0 to 1. */
  score: number
  /** One or two sentences for the learner, already translated. Optional. */
  feedback?: string
}

/** Props the host passes to a mounted block. Everything is plain, serializable data. */
export interface BlockProps {
  /** The block's normalized data. */
  data: any
  /** The lesson's programming language, for blocks that show code. */
  codeLanguage: string
  /** Missing means "visualization" (API 1.0 hosts never set it). */
  mode?: BlockMode
  /** Exercise mode: the learner's answer so far, to restore when they come back. */
  answer?: unknown
  /**
   * Exercise mode: set once the answer was checked. The block should lock input and may show
   * the correct answer. Cleared again when the learner retries a practice exercise.
   */
  result?: GradeResult | null
  /** Host-specific extras (built-in blocks only), e.g. the comparison's active variant. */
  [extra: string]: unknown
}

export interface BlockInstance {
  update(props: BlockProps): void
  unmount(): void
}

/** Removes what a render helper put into its element. */
export type Dispose = () => void

/** The only way a block talks to the app. */
export interface BlockContext {
  /** Current interface language, e.g. "pl". */
  readonly locale: string
  /** Translates the block's own English messages from its own catalogs. */
  t(message: string, values?: readonly unknown[]): string
  formatNumber(value: number, options?: Intl.NumberFormatOptions): string
  /** Renders sanitized Markdown with the app's styling and glossary. Calling it again on the same element replaces the content. */
  renderMarkdown(el: HTMLElement, source: string, options?: { inline?: boolean }): Dispose
  /** Renders highlighted code with the app's code styling. */
  renderCode(el: HTMLElement, options: { code: string; language: string; fileName?: string }): Dispose
  /** Renders one of the app's icons. */
  renderIcon(el: HTMLElement, name: string, options?: { size?: number }): Dispose
  /**
   * Exercise mode: report the learner's current answer (plain, serializable data).
   * `complete: false` keeps the Check button disabled, e.g. while slots are still empty.
   */
  answer(value: unknown, options?: { complete?: boolean }): void
  /** Sends an event to the host, e.g. ("update:modelValue", 1). The name "answer" is reserved. */
  emit(event: string, payload?: unknown): void
}

/** Metadata about the stored data passed to normalize. */
export interface StoredBlockData {
  /** Block version that produced the data; "1.0.0" for lessons saved before versioning. */
  version: string
  /** Which schema the data follows. Missing means "visualization". */
  mode?: BlockMode
}

/** The code half of a block: what a plugin's index.js exports as default. Runs in the renderer only. */
export interface BlockModule<Data = any> {
  /** Validate and normalize model output or stored data. Return null to reject it. */
  normalize(data: any, stored: StoredBlockData): Data | null
  /** Plain-text description given to the tutor chat as context. */
  describe(data: Data): string
  /** Render into `el`, which the host owns. */
  mount(el: HTMLElement, props: BlockProps, ctx: BlockContext): BlockInstance
  /** Whether the block shows the worked example itself, so the card hides its own code listing. */
  ownsCode?(data: Data): boolean
  /**
   * Exercise mode (API 1.1): grade the learner's answer deterministically, without AI.
   * Required when the spec declares `exercise`. `ctx` offers t, locale and formatNumber for feedback.
   */
  grade?(data: Data, answer: unknown, ctx: BlockContext): GradeResult
}

/** A registered block: data half, code half and the block's translations. */
export interface BlockDefinition<Data = any> extends BlockSpec, BlockModule<Data> {
  locales?: MessageCatalogs
}
