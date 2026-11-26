# Extensibility architecture

Status: accepted direction. Stages 1–2 done (2026-11-26).

## Goal

Thinkling should be extensible the way VS Code is. A learner who downloaded the desktop app, is not a programmer and has never seen our GitHub, must be able to find a plugin (for example *math*) and install it into the app they already have, without rebuilding or updating the app.

A marketplace (payments, ratings, creator accounts) is **out of scope** for now. The architecture must only be ready for one.

Built-in interactive components go through the same registry and contract as external plugins. If our own components cannot be written against the public API, the API is wrong.

## Problems this solves

1. **Adding a component was spread over five places** (fixed in stage 1). Each lesson visualization was defined in:
   - the JSON schema in `server/prompts.ts` (one big `anyOf`)
   - the AI instructions in `server/prompts.ts`
   - a validator/normalizer (`readers` in the former `src/lib/lesson-visualizations.ts`)
   - a description for the tutor chat (`describeVisualization`)
   - a hard-coded import in `LearnCard.vue`
2. **Prompt size grows with every component.** Today every lesson request carries every component's schema and instructions. With math, cybersecurity, electronics and ~20 programming languages this becomes unaffordable in tokens and quality. It also hits a hard limit earlier: the schema is passed to the Claude CLI as a `--json-schema` command-line argument (`server/providers.ts`), and Windows caps a command line at about 32k characters. The lesson schema alone is already ~12k characters.
3. **Components can only be added by shipping a new app build.**

## Block contract

A *block* is an interactive lesson component (today: a visualization on a learn card). It has two halves.

**Data half**: read by the server and never executed in Node.

| Field | Purpose |
|---|---|
| `id` | Stable identifier stored in lesson data. Built-in blocks keep their current ids (`step-trace`, `system-sim`, …). External blocks use `publisher/name`. |
| `version`, `engine` | Block version and the Thinkling API range it supports. |
| `summary` | 1–2 sentences for the catalog (stage 2). |
| `tags` | Domains (`programming`, `math`, `systems`, …) used to filter the catalog. |
| `schema` | JSON schema properties of the block's data (strict: all fields required, no extra properties). |
| `instructions` | Instructions for the model: when to use the block and how to fill it. |

**Code half**: runs only in the renderer.

| Function | Purpose |
|---|---|
| `normalize(data)` | Validate and normalize model output; return `null` to reject. Domain checks live here (for example `system-sim` simulates every configuration and rejects unsolvable scenarios). |
| `describe(data)` | Plain-text description given to the tutor chat as context. |
| `mount(el, props, ctx)` | Render the block (stage 3). Returns `{ update(props), unmount() }`. |

### Why `mount()` and not a shared Vue component

The plugin API is framework-agnostic:

- upgrading Vue in the app must not break third-party plugins;
- plugin authors can use any framework or plain canvas/SVG;
- props are serializable data and all communication goes through `ctx` (events, translation, theme), so external plugins can later be moved into a sandboxed iframe without changing the API.

Built-in blocks stay Vue components wrapped with a `vueBlock(Component)` adapter. Theming is exposed through CSS variables.

## Token budget: three levels

| Level | Content | When it is in the prompt | Cost |
|---|---|---|---|
| Catalog | `id` + `summary` | Plan generation only, filtered by the plan's domain tags | ~25 tokens per block |
| Spec | `schema` + `instructions` | Only for the blocks the planner assigned to the lesson (max 2–3) | Same as one block today |
| Knowledge packs | Domain rules, e.g. Rust conventions, math notation | Only when the plan's language/domain matches | Same |

The planner assigns each lesson `blocks: ["step-trace", "math/graph"]`. The lesson generator receives only those specs. Lesson cost does not depend on how many blocks are installed. Plans created before this change (no `blocks` field) get a default set.

### As implemented (stage 2)

- `BlockSpec.summary` is the catalog line. `planTask` and `refinePlanTask` list `id: summary` for every block, and the plan schema adds `blocks` to each lesson as an enum of known ids. The planner is told to pick 0–2, prefer one, and use `[]` for `test` lessons.
- `lessonTask` calls `selectBlocks(lesson.blocks)`: the visualization schema and instructions contain only those blocks. Unknown ids (for example an uninstalled plugin) are dropped. With no blocks the schema is `{ "type": "null" }` and the prompt says so.
- Lessons without a `blocks` field (plans made before stage 2) get every block, so their prompt is byte-for-byte what it was. Revising such a plan makes the planner fill in `blocks`.
- `tags` (filtering the catalog by domain) are deferred. With 10 blocks the whole catalog is about 10 lines; filtering pays off once installed plugins make it long.

Measured on a JavaScript lesson (characters sent to the CLI):

| Lesson blocks | Schema | Prompt | Total |
|---|---|---|---|
| all (legacy plan) | 11,932 | 15,383 | 27,315 |
| `["step-trace"]` | 3,900 | 9,322 | 13,222 |
| `["system-sim"]` (the largest block) | 6,335 | 11,713 | 18,048 |
| `[]` | 3,276 | 7,634 | 10,910 |

## Runtime loading

The desktop app does not load the frontend from files. A local Express server (`server/app.ts`) serves it at `http://127.0.0.1:<port>`, and validation already runs in the renderer. Installed plugins therefore need no rebuild:

```
<userData>/plugins/thinkling.math-graph/
├── manifest.json     data: id, version, engine, summary, tags
├── schema.json       data
├── instructions.md   data
└── index.js          code: ESM exporting normalize, describe, mount
```

- The server reads the data files and exposes `GET /api/plugins` plus static files under `/plugins/<id>/*`. It never imports plugin code.
- The renderer loads code with `import('/plugins/<id>/index.js')`. Same origin, so the current CSP (`default-src 'self'`) allows it unchanged.
- `userData` is not touched by electron-updater, so plugins survive app updates.
- Installing: an in-app **Extensions** screen. Install from a `.thinkling` file (zip, drag and drop) first; later from a list hosted as static JSON (not a marketplace). Plugins can be disabled and uninstalled.
- A lesson that uses a missing block shows a placeholder: *"This lesson uses Math Graph. Install it"*, never an error.

## Security

Electron is configured well (`sandbox: true`, `contextIsolation`, no Node in the renderer). However, the desktop session attaches the auth header to **every** request from the app origin. Plugin code running in the main frame can therefore call the whole `/api/*`, including the Docker sandbox and state writes.

Decision for now: **plugins are trusted code**, as in VS Code. The install dialog says so plainly ("this plugin has full access; install only from sources you trust").

The `mount()` contract (serializable props, everything through `ctx`, no imports from the app) keeps the path open to running external plugins in a sandboxed iframe later without breaking them.

## Data versioning

Stored lessons (`data/db.json`) reference blocks by `type`/id. When a block changes its data shape, old lessons must still render or be migrated. Block data gets a version before external plugins exist (stage 3).

## Code layout (after stage 1)

A block is one self-contained folder: data, logic, view and translations.

```
src/blocks/
├── schema.ts            BlockSpec type and strict-schema helpers (server-safe)
├── catalog.ts           BLOCK_SPECS, visualizationSchema(), visualizationInstructions() (server-safe)
├── types.ts             BlockDefinition: spec + normalize, describe, component
├── registry.ts          renderer registry: readLessonVisualization, describeVisualization
├── helpers.ts           shared normalizer helpers
├── shared/              UI shared by several built-in blocks (StepControls), with its own messages
└── <id>/
    ├── spec.ts          data half: id, schema, instructions
    ├── index.ts         code half: normalize, describe, component
    ├── <Name>.vue       view
    ├── <logic>.ts       domain logic, when the block has any (simulation.ts, regression.ts, expression.ts)
    ├── messages.ts      the block's own t()
    └── locales/pl.ts    the block's translations
```

Adding a built-in block means one folder plus one line in `catalog.ts` and one in `registry.ts`. `tests/unit/blocks.test.ts` fails if the two lists diverge.

## Translations

Translations belong to the module that uses them, so a plugin ships its own and the app catalog never needs to know about it.

- Messages are English source strings, as in the rest of the app. A block translates them with its own `t` from `messages.ts`, created by `createTranslator({ pl })` in `src/lib/i18n.ts`. It follows the app's interface language and falls back to English.
- `src/locales/pl.ts` holds only the app's own messages. A message used both by a block and by the app is kept in both catalogs, so a block never depends on the app catalog.
- `tests/unit/blocks.test.ts` fails when a block calls `t()` with a message missing from its own `locales/pl.ts`, or imports the app's `t`.
- For external plugins (stage 4) the catalogs become `locales/<lang>.json` data files listed in the manifest, and `ctx.t` replaces the import of `messages.ts`. Adding an interface language later means adding a file per plugin, not touching the app.

## What blocks still import from the app (future SDK surface)

Built-in blocks may import app modules. External plugins cannot. Everything below must be offered through `ctx` (or an SDK package) in stage 3:

| Import | Used by | Becomes |
|---|---|---|
| `components/Markdown.vue` | 9 files | `ctx.renderMarkdown` |
| `components/CodeBlock.vue` | 4 files | `ctx.renderCode` |
| `components/Icon.vue` | 3 files | `ctx.icon` or a bundled icon set |
| `components/CodeTutor.vue` | code-comparison | stays built-in only (tied to lesson navigation) |
| `lib/i18n.ts` `numberFormatter`, `uiLocale` | value-chart, linear-regression, system-sim | `ctx.locale`, `ctx.formatNumber` |
| `vue` | all views | not shared; plugins bundle their own framework |

## Stages

1. **Internal registry, no behavior change.** *(done)* `BlockSpec` (data) and `BlockDefinition` (code) interfaces. The 10 visualizations move to `src/blocks/<id>/`. `server/prompts.ts` builds the visualization schema and instructions from the registry. `LearnCard.vue`, the tutor context and the examples composable read from the registry. The generated prompt and schema stay byte-for-byte identical.
2. **Catalog and per-lesson block selection.** *(done; `tags` deferred)* `summary`/`tags` on specs, a `blocks` field on plan lessons, and the lesson prompt contains only the selected specs.
3. **Data/code split and `mount()`.** Built-in blocks described by the same manifest shape as external ones; the `vueBlock` adapter; the SDK surface above exposed through `ctx`; versioned block data. Remove the `code-comparison` special case in `LearnCard.vue` (its step state is shared with lesson navigation).
4. **Runtime loader.** `<userData>/plugins`, `GET /api/plugins`, dynamic `import()`, and an example plugin in `examples/` built separately from the app. This proves installation without a rebuild.
5. **Extensions screen.** Install from file, disable, uninstall, placeholder for missing blocks.
6. **Later.** Remote catalog, iframe isolation, pluggable *exercise types* with a grading contract (correct / almost / wrong and a score feed progress and spaced repetition), so non-programming domains stop being squeezed into `code` and `choice`.

Stages 1–2 fix the token problem. Stages 3–5 deliver "install math without GitHub".
