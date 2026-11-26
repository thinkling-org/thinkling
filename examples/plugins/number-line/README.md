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

## Package and install

Pack the folder into a `.thinkling` file (a zip of the folder):

```sh
npm run plugin:pack -- examples/plugins/number-line
# -> examples.number-line-1.0.0.thinkling
```

In Thinkling, open **Extensions**, drop the file onto the page (or choose it) and confirm. Installing a newer version of the same `id` replaces the old one. Extensions can be turned off or removed on the same screen.

For development you can also copy the folder straight into the `plugins` folder of Thinkling's data directory and restart:

- Windows desktop app: `%APPDATA%\Thinkling\data\plugins\` (older installs: `%APPDATA%\Codenoms\data\plugins\`)
- Running from source: `data/plugins/` in the repository
- A custom data directory set with `THINKLING_DATA`: `$THINKLING_DATA/plugins/`

Invalid plugins are skipped; the reasons appear on the Extensions screen.

Plugins run with the same access as the app itself. Install only plugins you trust.

See `docs/architecture/extensibility.md` for the full API.
