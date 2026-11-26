# Number line: example block plugin

A minimal Thinkling block plugin. It is plain JavaScript with no build step and no framework, and it uses only the plugin API (`ctx`). Use it as a template for your own block.

## Files

| File | Purpose |
|---|---|
| `manifest.json` | `id` (`publisher/name`), `version`, `engine` (supported block API range), `name`, `summary` for the lesson planner, and paths to the files below. |
| `schema.json` | JSON schema properties of the block's data. List properties only: Thinkling adds `type` and makes every object strict. |
| `instructions.md` | Tells the model when to use the block and how to fill the data. It completes the sentence `"<id>": …`, so start in lowercase. |
| `index.js` | ES module that exports `default { normalize, describe, mount }`. Runs in the app window only. |
| `locales/pl.json` | Translations of the block's English messages, used by `ctx.t`. |

## Install

Until the Extensions screen exists, copy this folder into the `plugins` folder of Thinkling's data directory and restart Thinkling:

- Windows desktop app: `%APPDATA%\Thinkling\data\plugins\number-line` (older installs: `%APPDATA%\Codenoms\data\plugins\…`)
- Running from source: `data/plugins/number-line` in the repository
- A custom data directory set with `THINKLING_DATA`: `$THINKLING_DATA/plugins/number-line`

Invalid plugins are skipped; the reasons appear in `GET /api/plugins` under `errors` and in the app window's console.

Plugins run with the same access as the app itself. Install only plugins you trust.

See `docs/architecture/extensibility.md` for the full API.
