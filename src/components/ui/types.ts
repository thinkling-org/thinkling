export type ChoiceValue = string | number | boolean

export interface ChoiceOption<V extends ChoiceValue = ChoiceValue> {
  value: V
  label: string
  disabled?: boolean
  /** Tooltip, e.g. a model description. */
  title?: string
  /** Extra class on the chip, for per-option styling. */
  class?: string
}

export interface TabItem<V extends string | number = string> {
  value: V
  label: string
}
