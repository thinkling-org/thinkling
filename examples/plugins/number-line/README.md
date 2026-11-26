# Number line: example block plugin

A minimal Thinkling block plugin. It is plain JavaScript with no build step and no framework, and it uses only the plugin API (`ctx`). Use it as a template for your own block.

It works in two modes:

- **Visualization** on a learn card: the learner moves a marker past labelled values and notes appear along the way.
- **Exercise** (block API 1.1): "Mark −2.5 on the number line". The block grades the answer itself: correct within `tolerance`, almost one slider step away. After checking, the line shows the correct position.

## Files

| File | Purpose |
|---|---|
| `manifest.json` | `id` (`publisher/name`), `version`, `engine` (supported block API range; `^1.1.0` because of the exercise mode), `name`, `summary` for the lesson planner, and paths to the files below. |
| `schema.json` | JSON schema properties of the visualization data. List properties only: Thinkling adds `type` and makes every object strict. |
| `instructions.md` | Tells the model when to use the visualization and how to fill the data. It completes the sentence `"<id>": …`, so start in lowercase. |
| `exercise-schema.json` | Properties of an exercise task, including the answer key (`target`, `tolerance`). Declared under `exercise` in the manifest. |
| `exercise.md` | Tells the model how to pose a task. Same style as `instructions.md`. |
| `index.js` | ES module that exports `default { normalize, describe, mount, grade }`. Runs in the app window only. `grade` is only needed for the exercise mode. |
| `locales/pl.json` | Translations of the block's English messages, used by `ctx.t`. |

In exercise mode `mount` receives `props.mode === "exercise"`, reports the learner's answer with `ctx.answer(value, { complete })`, and gets the grade in `props.result` after checking.

## Package and install

Pack the folder into a `.thinkling` file (a zip of the folder):

```sh
npm run plugin:pack -- examples/plugins/number-line
# -> examples.number-line-1.1.0.thinkling
```

In Thinkling, open **Extensions**, drop the file onto the page (or choose it) and confirm. Installing a newer version of the same `id` replaces the old one. Extensions can be turned off or removed on the same screen.

For development you can also copy the folder straight into the `plugins` folder of Thinkling's data directory and restart:

- Windows desktop app: `%APPDATA%\Thinkling\data\plugins\` (older installs: `%APPDATA%\Codenoms\data\plugins\`)
- Running from source: `data/plugins/` in the repository
- A custom data directory set with `THINKLING_DATA`: `$THINKLING_DATA/plugins/`

Invalid plugins are skipped; the reasons appear on the Extensions screen.

Plugins run with the same access as the app itself. Install only plugins you trust.

See `docs/architecture/extensibility.md` for the full API.
