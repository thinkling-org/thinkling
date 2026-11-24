<p align="center"><img src="public/logo.svg" width="112" alt="" /></p>

# Codenoms

[codenoms.org](https://codenoms.org) · **English** · [Polski](README.pl.md)

A local app for learning to code fast through short, gamified lessons. It runs on your existing
**Claude (Claude Code CLI) or ChatGPT (Codex CLI) subscription**, so you don't need an API key.

The interface supports **English and Polish**. On first launch, Codenoms saves your preferred system language
on desktop or your browser language on the web. Other languages use the English interface. New AI responses use
your saved language. You can change it under **Settings → Language**.

Use English source messages in `t()` and add their Polish translations in [`src/locales/pl.js`](src/locales/pl.js).

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

### Windows desktop app

```powershell
npm.cmd ci
npm.cmd run desktop          # builds the frontend and opens the Electron window
npm.cmd run desktop:package  # creates an .exe installer in release/
```

Electron starts a local server for the lifetime of the app. The desktop data directory is
`%APPDATA%\Codenoms\data`. To open an existing plan, progress, and local environments from
the browser version, stop its server and set `CODENOMS_DATA` to the previous data directory.
From the repository root in PowerShell, run the following.

```powershell
$env:CODENOMS_DATA = (Resolve-Path .\data).Path
npm.cmd run desktop
```

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
recognized text is inserted at the cursor. Codenoms transcribes locally with Faster Whisper
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
- Prompts and schemas live in [server/prompts.js](server/prompts.js), and CLI execution in [server/providers.js](server/providers.js).
- JS/TS task tests run in the browser ([src/lib/runner.worker.js](src/lib/runner.worker.js)) with `test`, `expect`,
  `mockFn` and `sleep`. TypeScript is transpiled by Monaco's TS worker. Solutions in other languages are graded by the
  model alone, without running the code (unless Docker is available, see below).

## Sandbox (Docker): a real editor and terminal

When Docker is running, tasks in PHP, C++, Python, Go, Rust, Java, C#, Ruby and SQL (and optionally JS/TS) run in real
containers. The code is in [server/sandbox.js](server/sandbox.js).

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

Codenoms is meant to run on your own machine only. The server listens on `127.0.0.1` and rejects requests from
other origins. Don't expose it to a network (for example with `HOST=0.0.0.0`): anyone who can reach it gets a
terminal in the sandbox and can change which binary the app runs.

## Author

Codenoms was created by [Konrad Ciurkiewicz](https://github.com/konradciurkiewicz). Bug reports, ideas and pull
requests are welcome.

## License

Codenoms is free and open source under the [Apache License 2.0](LICENSE). You may use, modify and distribute it,
including commercially, as long as you keep the copyright and license notices (see [NOTICE](NOTICE)).
The license does not grant rights to the project's name or logo.
