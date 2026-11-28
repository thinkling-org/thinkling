# Design system

The look lives in [`src/styles/base.css`](../src/styles/base.css): design tokens (CSS variables) and a small set of global classes. The Vue primitives in [`src/components/ui/`](../src/components/ui/) are thin wrappers over those classes. They fix the API (variants, states, accessibility), and the CSS stays the single source of the look.

## Tokens

| Group | Tokens | Notes |
|---|---|---|
| Surfaces and text | `--bg`, `--bg-deep`, `--surface`, `--surface-2`, `--border`, `--divider`, `--text`, `--text-2`, `--text-3`, `--muted`, `--faint` | Dark theme only. |
| Palette | `--purple*`, `--green*`, `--yellow*`, `--red*`, `--blue*`, `--flame` | Raw colours. Avoid in new code. |
| Semantic colours | `--color-accent`, `--color-link`, `--color-success`, `--color-warning`, `--color-danger`, `--color-info`, each with `-soft`, `-ink` and `-border` where they exist | Prefer these. They say what a colour means, so a palette change stays in one place. |
| Type | `--font`, `--mono`, `--text-xs` … `--text-xl` (12–24px), `--weight-medium/bold/black`, `--tracking-caps`, `--tracking-button` | |
| Spacing | `--space-1` … `--space-10` | 4px grid. |
| Radius | `--radius-xs` (6) … `--radius-4xl` (24), `--radius-pill` | `--radius` is kept as an alias of `--radius-2xl`. |
| 3D edge | `--border-width`, `--edge`, `--edge-sm`, `--press-depth` | The pressed-button look: a thick bottom border that collapses on `:active`. |

New CSS should use tokens instead of literal colours, sizes and radii. Literal colours are fine in theme definitions for third-party widgets (Monaco, xterm).

## Primitives

Import from `src/components/ui/index.ts`.

| Component | Class | API |
|---|---|---|
| `UiButton` | `.btn`, `.btn-<variant>`, `.btn-sm/lg`, `.btn-block`, `.link-btn` | `variant`: `default`, `primary`, `green`, `yellow`, `red`, `ghost`, `ghost-yellow`, `ghost-red`, `ghost-green`, `link`. `size`: `sm`, `md`, `lg`. `block`, `disabled`, `loading`. Renders a `RouterLink` with `to`, an `<a>` with `href`, or a `<button type="button">` (pass `type="submit"` in forms). |
| `UiChip` | `.chip` | A single chip. With `pressed` it is a toggle (`aria-pressed`): use `v-model:pressed` for on/off, or `:pressed` + `@click` for single-choice groups. Without `pressed` it is a plain action. |
| `UiChoiceGroup` | `.chip` | A row of chips to pick from. `options` (`value`, `label`, `disabled`, `title`, `class`), `v-model`, `label` or `labelledby`. Single choice is a radio group (arrows, Home and End move and select; one tab stop). `multiple` makes it toggle buttons over an array. Use it instead of a hand-made row of `UiChip`. |
| `UiIconButton` | `.icon-btn`, `.icon-btn-xs/sm/lg`, `.icon-btn-outlined` | Flat icon-only button. `label` is required (accessible name and tooltip). `icon` (an `Icon` name) or slot content, `size`, `variant`, `iconSize`, `stroke`. Exposes `focus()`. |
| `UiTabs` | — | WAI-ARIA tabs with automatic activation. `tabs` (`value`, `label`), `v-model`, `variant` (`file` or `panel`), `label`. Slot `tab` for custom content, slot `end` for controls next to the tabs (outside the tablist). `closable` adds a close control and closes on Delete or middle click (`@close`). Panels stay with the parent. |
| `UiTag` | `.tag`, `.tag-<tone>` | `tone`: `neutral`, `purple`, `green`, `yellow`, `red`. |
| `UiCard` | `.card`, `.card-dashed` | `dashed`, `as`. |
| `UiInput` | `.input`, `.field` | `v-model`. `multiline` renders the large textarea. Other attributes fall through to the control. |
| `UiProgress` | `.bar` | `value`, `max` (default 1), `label`. Renders `role="progressbar"`. |
| `UiSpinner` | `.spinner`, `.spinner-sm` | `size`. Decorative unless `label` is set. Inside a button it takes the button's text colour. |
| `UiDialog` | — | Native `<dialog>` modal: focus trap, inert background, Escape. `v-model:open`, `title`, `description`; slots `icon`, default, `actions`, `footer`. |

Rules:

- Use the primitives instead of writing `class="btn …"` by hand. The classes stay public for places a component cannot reach (plugins, Markdown output).
- Extra classes and attributes on a primitive fall through to its root element, so layout tweaks (`class="self"`) and test hooks keep working.
- Plain `.card` containers may stay as `<div class="card">`: `UiCard` adds no behaviour, use it where it reads better.

## Plugins

External plugins do not get the Vue components. The plugin API is framework-agnostic (see [extensibility](architecture/extensibility.md#styling-contract)). They get the tokens and the global classes instead.
