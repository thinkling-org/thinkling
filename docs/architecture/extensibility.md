# Extensibility architecture

Status: accepted direction. Stages 1–5 done (2026-11-26).

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

**Code half**: runs only in the renderer. Types: `BlockModule` in `src/blocks/types.ts`.

| Function | Purpose |
|---|---|
| `normalize(data, { version })` | Validate and normalize model output or stored data; return `null` to reject. Domain checks live here (for example `system-sim` simulates every configuration and rejects unsolvable scenarios). `version` is the block version that produced the data, for migrations. |
| `describe(data)` | Plain-text description given to the tutor chat as context. |
| `mount(el, props, ctx)` | Render into `el`. Returns `{ update(props), unmount() }`. |
| `ownsCode?(data)` | Optional: the block shows the worked example itself, so the card hides its own code listing. |

### Plugin API v1 (implemented in stage 3)

`BLOCK_API_VERSION` is `1.0.0`; every block declares `engine: "^1.0.0"`.

`props` passed to `mount` and `update`:

| Prop | Meaning |
|---|---|
| `data` | The normalized block data. |
| `codeLanguage` | The lesson's programming language. |
| others | Host extras for built-in blocks only (today: the comparison's `modelValue` and `step`). |

`ctx`, the only channel to the app:

| Member | Purpose |
|---|---|
| `locale` | Current interface language. |
| `t(message, values?)` | Translates the block's own English messages from its own catalogs (`locales`). |
| `formatNumber(value, options?)` | Locale-aware number formatting. |
| `renderMarkdown(el, source, { inline? })` | Sanitized Markdown with the app's styling and glossary. Returns a dispose function; calling it again on the same element replaces the content. |
| `renderCode(el, { code, language, fileName? })` | Highlighted code in the app's style. |
| `renderIcon(el, name, { size? })` | One of the app's icons. |
| `emit(event, payload?)` | Event to the host, e.g. `update:modelValue`. |

Host guarantees: `BlockHost.vue` owns `el` (rendered with `display: contents`, so the block's root lays out as a direct child of the card), calls `update` when props change and `unmount` before removing it. A block that throws in `mount`, `update`, `unmount`, `normalize` or `describe` is logged and skipped; the lesson keeps working.

Data versioning: when a lesson is generated, the store stamps each visualization with `blockVersion` (`stampBlockVersion` in `catalog.ts`). `readLessonVisualization` passes it to `normalize`; data saved before versioning reports `1.0.0`.

### Why `mount()` and not a shared Vue component

The plugin API is framework-agnostic:

- upgrading Vue in the app must not break third-party plugins;
- plugin authors can use any framework or plain canvas/SVG;
- props are serializable data and all communication goes through `ctx` (events, translation, theme), so external plugins can later be moved into a sandboxed iframe without changing the API.

Built-in blocks stay Vue components wrapped with `vueBlock(Component)` (`src/blocks/vue-block.ts`). It mounts each block as its own small Vue app, passes `data` as the `config` prop plus only the host props the component declares, forwards the component's declared events to `ctx.emit`, and provides `ctx` under `BLOCK_CONTEXT` for `inject`. Blocks therefore cannot rely on the host app's plugins (Pinia, router) or provide/inject; module-level state such as the glossary is shared. Theming is exposed through CSS variables.

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

### As implemented (stage 4)

Plugins live in `<data>/plugins/<folder>/`, where `<data>` is the data directory (`THINKLING_DATA`; the desktop app uses `%APPDATA%\Thinkling\data`). A working example is `examples/plugins/number-line` (plain JavaScript, no build step); its README describes the files and how to install it.

Server (`server/plugins.ts`):

- `loadPlugins()` reads every folder on each call (cheap, so a copied-in plugin is picked up by the next AI task). Invalid plugins are reported, never thrown.
- Validation: `id` is `publisher/name` and cannot shadow a built-in or an earlier plugin; `version` is semver; `engine` must accept `BLOCK_API_VERSION` (caret ranges); every manifest path must stay inside the plugin folder; the schema must be an object of properties without `type`; locales map strings to strings.
- Limits keep one plugin from flooding prompts: summary ≤ 300 characters, instructions ≤ 4,000, schema ≤ 8,000.
- `strictSchema` adds `required` and `additionalProperties: false` to every nested object, so authors list properties only.
- `GET /api/plugins` returns `{ plugins, errors }`. `/plugins/<folder>/*` serves files with `no-cache`; missing files are 404 (never the app page), dotfiles and path traversal are refused. In development Vite proxies `/plugins` to the API server.
- `availableBlockSpecs()` (built-in + valid plugins) feeds the planner catalog, the plan schema's `blocks` enum and `selectBlocks`. Lessons from plans made before stage 2 still get built-in blocks only.

Renderer (`src/blocks/installed.ts`):

- `main.ts` calls `loadInstalledBlocks()` alongside loading the saved state and waits for it at most 3 seconds. `installedBlocks` is reactive, so a slower plugin still appears in an open lesson.
- Each entry is loaded with a native `import()`. The module's default export must have `normalize`, `describe` and `mount`; otherwise the plugin is listed in `pluginProblems` and the others still load.
- `registry.blockDefinition()` looks up built-ins first, then installed blocks. The host adds `type` to normalized data, so plugins need not copy it.
- This module is separate from `registry.ts`, so loading plugins does not pull the built-in block views into the main bundle.

### As implemented (stage 5): Extensions screen

`/extensions` (`src/views/ExtensionsView.vue`, linked from the sidebar) lists installed extensions with a "Use in lessons" switch and a Remove button (second click confirms), lists extensions that could not be loaded with their error and a Remove button, and installs `.thinkling` files by drag and drop or a file picker. Choosing a file shows a trust warning first; nothing is uploaded until the learner confirms.

A `.thinkling` file is a zip of the plugin folder (its contents or the folder itself). Authors create it with `npm run plugin:pack -- <folder>`.

Server API (all under `/api`, so the origin check and desktop authorization apply; a cross-origin page cannot install code):

| Request | Effect |
|---|---|
| `POST /api/plugins` (body: the file) | Unpack into a hidden staging folder, validate exactly like an installed plugin, then swap it into `<plugins>/<publisher>.<name>`. An existing install of the same id (also a manually copied folder) is moved aside first and restored if the swap fails, so a bad file never breaks a working version. Returns `{ plugin, previousVersion }`. |
| `PATCH /api/plugins/:folder` `{ enabled }` | Turn off or on. Stored by id in `<plugins>/disabled.json`, so it survives reinstalling. Disabled plugins are listed but not loaded and not offered to the planner. |
| `DELETE /api/plugins/:folder` | Remove the folder, valid or broken, and forget its switch. |

Archive limits: 10 MB file, 500 entries, 50 MB unpacked. Absolute paths, drive letters, backslashes and `..` are refused; `__MACOSX/` and hidden files are skipped.

Renderer: after each change `loadInstalledBlocks()` syncs: new and updated plugins are imported (the entry URL carries `?v=<version>` so an update is not served from the module cache), disabled and removed ones are dropped. An update to an already loaded plugin sets `restartRecommended`, because files the entry imports may still be cached.

A learn card whose visualization type is not available, once plugins have loaded, shows "This card uses the "…" extension, which is turned off / not installed" with a link to the Extensions screen.

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
├── schema.ts            BlockSpec (manifest shape), BLOCK_API_VERSION, strict-schema helpers (server-safe)
├── catalog.ts           BLOCK_SPECS, selectBlocks, schema/instructions builders, stampBlockVersion (server-safe)
├── types.ts             public API: BlockModule, BlockProps, BlockContext, BlockInstance, BlockDefinition
├── registry.ts          renderer registry: readLessonVisualization, describeVisualization
├── context.ts           the app's BlockContext implementation
├── vue-block.ts         vueBlock(Component) adapter and BLOCK_CONTEXT injection key
├── BlockHost.vue        mounts a block through mount() and keeps it in sync
├── helpers.ts           shared normalizer helpers
├── shared/              UI shared by several built-in blocks (StepControls), with its own messages
└── <id>/
    ├── spec.ts          data half: id, version, engine, summary, schema, instructions
    ├── index.ts         code half: normalize, describe, mount: vueBlock(View), locales
    ├── <Name>.vue       view
    ├── <logic>.ts       domain logic, when the block has any (simulation.ts, regression.ts, expression.ts)
    ├── messages.ts      the block's catalogs and its own t()
    └── locales/pl.ts    the block's translations
```

Built-in blocks have no `manifest.json` file: `spec.ts` is the manifest in TypeScript form, with the same fields. For external plugins (stage 4) the loader builds the same `BlockSpec` from `manifest.json`, `schema.json` and `instructions.md`.

Adding a built-in block means one folder plus one line in `catalog.ts` and one in `registry.ts`. `tests/unit/blocks.test.ts` fails if the two lists diverge.

## Translations

Translations belong to the module that uses them, so a plugin ships its own and the app catalog never needs to know about it.

- Messages are English source strings, as in the rest of the app. A block translates them with its own `t` from `messages.ts`, created by `createTranslator({ pl })` in `src/lib/i18n.ts`. It follows the app's interface language and falls back to English.
- `src/locales/pl.ts` holds only the app's own messages. A message used both by a block and by the app is kept in both catalogs, so a block never depends on the app catalog.
- `tests/unit/blocks.test.ts` fails when a block calls `t()` with a message missing from its own `locales/pl.ts`, or imports the app's `t`.
- For external plugins (stage 4) the catalogs become `locales/<lang>.json` data files listed in the manifest, and `ctx.t` replaces the import of `messages.ts`. Adding an interface language later means adding a file per plugin, not touching the app.

## What built-in blocks still import from the app

Built-in blocks may import app modules; external plugins cannot and use `ctx` instead. Each import below has its `ctx` equivalent since stage 3. The built-in views keep the direct imports because rewriting their templates around `ctx` would add risk without changing behavior.

| Import | Used by | Plugin equivalent |
|---|---|---|
| `components/Markdown.vue` | 9 files | `ctx.renderMarkdown` |
| `components/CodeBlock.vue` | 4 files | `ctx.renderCode` |
| `components/Icon.vue` | 3 files | `ctx.renderIcon` |
| `components/CodeTutor.vue` | code-comparison | none; stays built-in only (tied to lesson navigation) |
| `lib/i18n.ts` `numberFormatter`, `uiLocale` | value-chart, linear-regression, system-sim | `ctx.formatNumber`, `ctx.locale` |
| `vue` | all views | not shared; plugins bundle their own framework |

## Stages

1. **Internal registry, no behavior change.** *(done)* `BlockSpec` (data) and `BlockDefinition` (code) interfaces. The 10 visualizations move to `src/blocks/<id>/`. `server/prompts.ts` builds the visualization schema and instructions from the registry. `LearnCard.vue`, the tutor context and the examples composable read from the registry. The generated prompt and schema stay byte-for-byte identical.
2. **Catalog and per-lesson block selection.** *(done; `tags` deferred)* `summary`/`tags` on specs, a `blocks` field on plan lessons, and the lesson prompt contains only the selected specs.
3. **Data/code split and `mount()`.** *(done)* Built-in blocks described by the same manifest shape as external ones; the `vueBlock` adapter; the SDK surface above exposed through `ctx`; versioned block data. Not done: removing the `code-comparison` special case in `LearnCard.vue`. Lesson navigation drives the comparison's steps (Next/Back walk through them before leaving the card), so it now goes through generic host props and `ctx.emit`, but `LearnCard` still knows it by id. Making this generic needs a "stepper" capability blocks can declare; that waits until a second block needs it.
4. **Runtime loader.** *(done)* `<userData>/plugins`, `GET /api/plugins`, dynamic `import()`, and an example plugin in `examples/` built separately from the app. This proves installation without a rebuild.
5. **Extensions screen.** *(done)* Install from file, disable, uninstall, placeholder for missing blocks.
6. **Later.** Remote catalog, iframe isolation, pluggable *exercise types* with a grading contract (correct / almost / wrong and a score feed progress and spaced repetition), so non-programming domains stop being squeezed into `code` and `choice`.

Stages 1–2 fix the token problem. Stages 3–5 deliver "install math without GitHub".
