// Design-system primitives. Thin wrappers over the global classes in
// src/styles/base.css: the classes stay the source of truth for the look,
// the components fix the API (variants, states, accessibility).
// Prefer these over hand-written `class="btn btn-…"` in new code.
export { default as UiButton } from './UiButton.vue'
export type { ButtonSize, ButtonVariant } from './UiButton.vue'
export { default as UiCard } from './UiCard.vue'
export { default as UiChip } from './UiChip.vue'
export { default as UiChoiceGroup } from './UiChoiceGroup.vue'
export type { ChoiceOption, ChoiceValue, TabItem } from './types.ts'
export { default as UiDialog } from './UiDialog.vue'
export { default as UiIconButton } from './UiIconButton.vue'
export { default as UiInput } from './UiInput.vue'
export { default as UiProgress } from './UiProgress.vue'
export { default as UiSpinner } from './UiSpinner.vue'
export { default as UiTabs } from './UiTabs.vue'
export { default as UiTag } from './UiTag.vue'
export type { TagTone } from './UiTag.vue'
