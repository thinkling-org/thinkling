<p align="center"><img src="public/logo.svg" width="112" alt="" /></p>

# Thinkling

[Thinkling on GitHub](https://github.com/codenoms-org/thinkling) · **English** · [Polski](README.pl.md)

A local app for learning to code fast through short, gamified lessons. It runs on your existing
**Claude (Claude Code CLI) or ChatGPT (Codex CLI) subscription**, so you don't need an API key.

The interface supports **English and Polish**. On first launch, Thinkling saves your preferred system language
on desktop or your browser language on the web. Other languages use the English interface. New AI responses use
your saved language. You can change it under **Settings → Language**.

Use English source messages in `t()` and add their Polish translations in [`src/locales/pl.ts`](src/locales/pl.ts).

- Describe your situation and the model builds a plan: modules, lessons and a skill assessment (the plan streams in live as it is generated).
- A learning path with lessons, XP, daily streaks, a daily goal and a 0–1000 score.
- Exercises:
  - **open questions**: the model grades your answer (0–10) and explains what was right and what was wrong,
  - **"what does this code print?"**: a quiz with an explanation and a "walk me through it step by step" button,
  - **coding tasks in the Monaco editor** (the editor behind VS Code): JS/TS tests run in a Web Worker, and the model's review shows up as comments pinned to lines, with an "apply fix" button.
- **Flashcards** with spaced repetition. Your mistakes are added to the deck automatically.
- "Ask Claude": a chat about the current exercise.

## Requirements

- Node.js 24.15.0 or newer to install dependencies and build from source. The [`.nvmrc`](.nvmrc) file pins Node.js 24 LTS for development. The Windows installer includes the runtime.
- **Claude Code** (`claude`) **or** **Codex** (`codex`), logged in. The app looks for the binary in `PATH`,
  `~/.local/bin`, VS Code/Cursor extensions and the Codex install directory. You can also set the path in Settings.
- Optional: **Docker** (sandbox with a terminal) and **Python 3.10–3.13** (dictation).

## Getting started

```bash
npm install
npm start          # build + server → http://localhost:3141
```

or in development mode:

```bash
npm run dev        # API on :3141 + Vite on http://localhost:5173
```

Run `npm run typecheck` to check the Vue, server and Electron TypeScript sources. The production build emits the renderer to `dist/` and the Node and Electron entry points to `dist-node/`.

### Windows desktop app

```powershell
npm.cmd ci
npm.cmd run desktop          # builds the frontend and opens the Electron window
npm.cmd run desktop:package  # creates an .exe installer in release/
```

Electron starts a local server for the lifetime of the app. The desktop data directory is
`%APPDATA%\Thinkling\data`. To open an existing plan, progress, and local environments from
the browser version, stop its server and set `THINKLING_DATA` to the previous data directory.
From the repository root in PowerShell, run the following.

```powershell
$env:THINKLING_DATA = (Resolve-Path .\data).Path
npm.cmd run desktop
```

### Desktop updates and releases

Thinkling is the new name of Codenoms. Existing desktop installations keep using their
`%APPDATA%\Codenoms\data` directory automatically when the new Thinkling data directory has no saved
database. Data stays in place to preserve Python environments and Docker mounts. `THINKLING_DATA`
overrides the data directory; the previous `CODENOMS_DATA` variable remains supported as a fallback.
The internal Windows application ID and Docker resource names also remain stable for compatibility.

Installed Windows builds check public [GitHub Releases](https://github.com/codenoms-org/thinkling/releases)
at startup and every six hours. The header offers a download when a newer stable version is available,
shows download progress, and then offers **Restart and update**. Downloading and restarting both require
a click. Closing the app normally does not install a pending update. Settings shows the current version,
a manual update check, and release notes. Update controls are hidden in the browser; development desktop
builds show the version but do not contact the update feed.

Before restarting, the app must successfully save progress. The existing Electron shutdown sequence then
flushes state and closes the local backend before the process exits. User data remains in
`%APPDATA%\Thinkling\data` (or the configured `THINKLING_DATA` directory).

To prepare a release, commit the changes on `main`, then run:

```bash
npm version patch
git push origin main --follow-tags
```

The `Windows release` workflow checks that the `v*` tag matches `package.json`, runs type checks and tests,
builds the x64 NSIS installer, and uploads a **draft** release. Download and test the installer before
publishing the draft on GitHub. Keep all generated `.exe`, `.blockmap`, and `latest.yml` assets together;
the updater needs the metadata as well as the installer. Only published stable releases reach users.
The release repository must be public so installed apps can read it without credentials. The publishing
token stays in GitHub Actions and is not bundled into the app.

For Windows Authenticode signing, configure repository secrets `WINDOWS_CSC_LINK` (a certificate URL or
base64 PFX supported by electron-builder) and `WINDOWS_CSC_KEY_PASSWORD`. Without these, the workflow
produces unsigned installers. Configure signing before broad public distribution; the updater can then
validate the publisher of downloaded updates. Do not disable signature verification.

The first build containing the updater must be installed manually. Before publishing, test an actual
installed version A upgrading to a higher version B from a published test release: check discovery,
download progress, retry after a network failure, explicit restart, and preserved plan/progress/settings.
Use a separate test repository with a local `build.publish` override for this test, so test releases do
not reach production users. Also verify that a normal quit never installs a downloaded update.
`npm run desktop:package` builds locally without publishing; `npm run desktop:release` uploads a draft
using `GH_TOKEN` and is intended for the release workflow. Full installer-to-installer verification cannot
be replaced by development mode or unit tests.

After packaging, `npm run test:desktop-updates` exercises the packaged main process, sandboxed preload,
IPC access checks, Polish update controls, download progress, a simulated save failure and retry, and
graceful shutdown. It uses isolated data and a fake update transport; it never runs an installer. The
release workflow also runs this smoke test. A UI screenshot is saved to `release/update-smoke.png`.

### First-run wizard

On first launch the app walks you through setup (`/setup`, later available under **Settings → Setup wizard**):

1. **AI engine**: detects Claude Code and Codex, checks that you are logged in (`claude auth status`, `codex login status`)
   and shows install or login commands if needed. This is where you pick the model and **effort** (reasoning effort).
2. **Docker**: checks that Docker is installed, running and usable without sudo. It can install Docker
   (Linux: `get.docker.com` via `pkexec`, macOS: Homebrew, Windows: winget) or start it, and can prebuild images
   for the languages you choose.
3. **Dictation**: creates `data/whisper/venv`, installs Faster Whisper and downloads the `small` model.

Installs run in the background on the server, so reloading the page doesn't interrupt them.

### Model and effort

In **Settings**, each provider has its own model and effort choice (remembered when you switch between Claude and Codex):

- **Claude Code**: the aliases `fable`, `opus`, `sonnet`, `haiku` (or a full model ID) and `--effort low…max`.
- **Codex**: the model list comes from `codex debug models` together with the supported levels, and is passed as
  `-m <model> -c model_reasoning_effort=<level>`.

## Dictation

In any focused text field, click the microphone or press **Alt+Shift+M**. Click again to stop recording, and the
recognized text is inserted at the cursor. Thinkling transcribes locally with Faster Whisper
(`small` model, CPU int8).

The local install uses `data/whisper/venv/bin/python` and the weights in `data/whisper/model`. On another machine,
install the packages from `server/whisper-requirements.txt` into a virtual environment, download the
[small model](https://huggingface.co/Systran/faster-whisper-small) and set `WHISPER_PYTHON` and `WHISPER_MODEL`
if you use different paths.

## How it works

```
Vue 3 (Vite, Pinia, Monaco)  ──fetch NDJSON──▶  Express :3141  ──spawn──▶  claude -p … --json-schema
                                                   │                       codex exec … --output-schema
                                                   └── data/db.json (plan, progress, flashcards, settings)
```

- Every request is a separate CLI process with tools disabled (`--tools ""`), no saved session, running in a
  temporary directory. The output is structured and validated against a JSON schema.
- The CLI process runs without `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` in its environment, so it always uses your
  subscription login.
- Prompts and schemas live in [server/prompts.ts](server/prompts.ts), and CLI execution in [server/providers.ts](server/providers.ts).
- JS/TS task tests run in the browser ([src/lib/runner.worker.ts](src/lib/runner.worker.ts)) with `test`, `expect`,
  `mockFn` and `sleep`. TypeScript is transpiled by Monaco's TS worker. Solutions in other languages are graded by the
  model alone, without running the code (unless Docker is available, see below).

## Sandbox (Docker): a real editor and terminal

When Docker is running, tasks in PHP, C++, Python, Go, Rust, Java, C#, Ruby and SQL (and optionally JS/TS) run in real
containers. The code is in [server/sandbox.ts](server/sandbox.ts).

- **Workspace:** each task gets its own `data/workspaces/<id>` directory, mounted in the container as `/workspace`.
  The Monaco editor with a file tree saves changes straight to disk.
- **Terminal:** a real `bash` inside the container (xterm.js over WebSocket).
- **Isolation and limits:** code runs as a non-root user (on Linux, with your own UID), with all Linux capabilities
  dropped and `no-new-privileges` set. Containers have no network, 1 GB of RAM (no swap), 2 CPUs and a 512-process
  limit, and idle ones are removed after 20 minutes. Each language image is built once, on first use (`codenoms/<language>:2`).
- **Tests:** a small harness per language prints `PASS name` or `FAIL name :: description` and exits with code 1 when
  something fails. The `go test -v` format is understood too.
- **Task verification:** when a lesson is generated, the reference solution must pass all tests and the starter
  template must fail at least one. This runs in a separate verification container, and if something doesn't match,
  the model gets one request to fix it.
- **Sandbox in the menu** is a free-form editor with a terminal in the language of your choice, with no task.

Without Docker, tasks in these languages are graded by the model only, while JS/TS still runs in a Web Worker in the
browser.

Keyboard shortcuts: `Enter` checks the answer or moves on, `1–4` picks an answer, and `Ctrl+Enter` works in text fields
and the editor. In flashcards, `Space` reveals the answer and `1–4` rates it.

## Security

Thinkling is meant to run on your own machine only. The server listens on `127.0.0.1` and rejects requests from
other origins. Don't expose it to a network (for example with `HOST=0.0.0.0`): anyone who can reach it gets a
terminal in the sandbox and can change which binary the app runs.

## Author

Thinkling was created by [Konrad Ciurkiewicz](https://github.com/konradciurkiewicz). Bug reports, ideas and pull
requests are welcome.

## License

Thinkling is free and open source under the [Apache License 2.0](LICENSE). You may use, modify and distribute it,
including commercially, as long as you keep the copyright and license notices (see [NOTICE](NOTICE)).
The license does not grant rights to the project's name or logo.
