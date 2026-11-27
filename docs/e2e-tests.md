# Browser E2E tests

Run `npm run test:e2e` after `npm ci` and `npx playwright install chromium`.
The command builds the app before testing. For all browser projects, install Firefox and WebKit
too, then use `npm run test:e2e:all`. On Linux, install browsers with `--with-deps`.
To rerun selected scenarios against an existing build, use
`npx playwright test --project=chromium tests/e2e/lessons.spec.ts`.

## Coverage map

| Screen / flow | Automated browser checks |
| --- | --- |
| First-run setup | Redirect, welcome, AI connection, skip optional installations, finish, persist completion |
| Start | Minimum description length, daily time, generate plan |
| Plan | Generate through real API/CLI adapter, expand module, revise, persist, generation retry, failed revision preserves plan |
| Learning path | Current/completed/locked lessons, locked and missing lesson URLs, remove weak spot, finished plan |
| Lessons | Choice, open grading, Monaco editing, browser worker tests, interactive ordering, missing extension, code trace, completion, XP, history, unlock next lesson, replay bonus, saved cards |
| Practice and support | Hints, failed test, retry with edited code, no practice grade, backward navigation, tutor chat |
| Lesson failures | Generation retry, actual generated-test verification, grading retry preserves answer, leave confirmation |
| Flashcards | Empty state, search, no matches, due/hard/all filters, reveal, delete and persist |
| Review | Empty state, Space/number shortcuts, Hard/Good/Easy scheduling, Again requeues, practice cards not yet due |
| Settings | Language and sound persistence, language save failure/retry, independent Claude/Codex model preferences, connection, cancel/confirm reset |
| Extensions | Real example archive upload, trust/cancel, load module, enable/disable, persist, remove, invalid/corrupt files |
| Sandbox | Offline Docker state and recheck |
| Routing | Root redirect, unknown route, missing plan guards, locked lesson guards |

All ten view components have browser scenarios. This is a map of tested behavior, not a claim
that every possible scenario or source branch is covered. Code coverage thresholds remain in
`vite.config.ts`; use `npm run test:coverage` for the unit, component and API report.

## Isolation and diagnostics

`support/fixtures.ts` creates a server process and OS temporary directory for each test. State is
seeded through the production state API, and assertions poll that API before reloading when a
debounced save matters. There are no production test-only reset routes or environment flags.
The fixtures stop their server and remove only their own temporary directory at teardown.

The production provider adapter launches a real Node child process containing `fake-cli.cjs`.
It exercises both Claude's streamed JSON protocol and Codex's output-file protocol. Responses
can be changed per test through `app.ai()`, including explicit provider errors. Unexpected AI
requests fail rather than reaching a real provider.

The test server replaces only the Docker connection module and restricts subprocess creation to
the fixture CLI directory. It cannot start Docker, install dependencies, record a microphone or
use the user's CLI subscription. One language persistence failure scenario intercepts the save
request to simulate a server failure; the other persistence checks use the real filesystem API.

Playwright records traces, screenshots and videos on failure. The fixture also attaches the
server's stdout/stderr and fails on uncaught browser exceptions. Open `npm run test:e2e:report`
to inspect a run. CI exercises Chromium, Firefox, WebKit and a Pixel viewport in Chromium.

## Checks requiring another environment

Real Docker containers, terminal sockets and language images, actual Claude/Codex subscription
logins and model behavior, microphone/Whisper capture, optional tool installation, Electron IPC
and operating-system installer updates need separate configured smoke/integration runs. Existing
`test:desktop-updates` and `test:installer-lifecycle` cover desktop update behavior. The browser
suite covers the Docker-offline fallback; it does not claim to test a running Docker sandbox.
