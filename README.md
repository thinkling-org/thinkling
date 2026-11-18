# DevLingo

Lokalna aplikacja do szybkiej nauki programowania w stylu Duolingo. Działa na Twojej
**subskrypcji Claude (Claude Code CLI) albo ChatGPT (Codex CLI)**, więc nie płacisz za tokeny API.

- Opisujesz swoją sytuację, a model układa plan: moduły, lekcje i ocenę poziomu (plan pojawia się na żywo w trakcie generowania).
- Ścieżka nauki jak w Duolingo: kolejne lekcje, XP, seria dni, cel dzienny i wynik 0–1000.
- Ćwiczenia:
  - **pytania otwarte**: model ocenia odpowiedź (0–10) i wypisuje, co jest dobrze, a co źle,
  - **„co wypisze ten kod?”**: quiz z wyjaśnieniem i przyciskiem „wyjaśnij krok po kroku”,
  - **zadania w edytorze Monaco** (to samo co w VS Code): testy JS/TS uruchamiane w Web Workerze, a review modelu pojawia się jako komentarze przypięte do linii, z przyciskiem „Zastosuj poprawkę”.
- **Fiszki** z powtórkami rozłożonymi w czasie. Twoje błędy automatycznie trafiają do talii.
- „Dopytaj Claude”: czat w kontekście bieżącego ćwiczenia.

## Wymagania

- Node 20+
- Zalogowane **Claude Code** (`claude`) **lub** **Codex** (`codex`). Aplikacja sama szuka binarki w PATH,
  `~/.local/bin`, rozszerzeniach VS Code/Cursor i w instalacji Codex. Ścieżkę możesz też podać w Ustawieniach.

## Uruchomienie

```bash
npm install
npm run dev        # API na :3141 + Vite na http://localhost:5173
```

albo w wersji produkcyjnej, na jednym porcie:

```bash
npm start          # build + serwer → http://localhost:3141
```

## Jak to działa

```
Vue 3 (Vite, Pinia, Monaco)  ──fetch NDJSON──▶  Express :3141  ──spawn──▶  claude -p … --json-schema
                                                   │                       codex exec … --output-schema
                                                   └── data/db.json (plan, postęp, fiszki, ustawienia)
```

- Każde zapytanie to osobny proces CLI z wyłączonymi narzędziami (`--tools ""`), bez zapisywania sesji,
  uruchamiany w katalogu tymczasowym. Wynik ma ustrukturyzowaną postać i jest walidowany schematem JSON.
- Proces CLI dostaje środowisko bez `ANTHROPIC_API_KEY` i `OPENAI_API_KEY`, więc zawsze korzysta z logowania subskrypcją.
- Prompty i schematy są w [server/prompts.js](server/prompts.js), a uruchamianie CLI w [server/providers.js](server/providers.js).
- Testy zadań JS/TS działają w przeglądarce ([src/lib/runner.worker.js](src/lib/runner.worker.js)): `test`, `expect`, `mockFn`, `sleep`.
  TypeScript jest transpilowany przez worker TS z Monaco. Rozwiązania w innych językach ocenia sam model, bez uruchamiania kodu.

## Piaskownica (Docker): prawdziwy edytor i terminal

Gdy działa Docker, zadania w PHP, C++, Pythonie, Go, Ruście, Javie, C#, Ruby i SQL (a opcjonalnie też JS/TS) wykonują się w prawdziwych kontenerach. Kod jest w [server/sandbox.js](server/sandbox.js).

- **Workspace:** każde zadanie ma własny katalog `data/workspaces/<id>`, podmontowany w kontenerze jako `/workspace`. Edytor Monaco z drzewem plików zapisuje zmiany prosto na dysk.
- **Terminal:** prawdziwy `bash` w kontenerze (xterm.js połączony przez WebSocket).
- **Izolacja i limity:** kontener nie ma sieci, ma limit 1 GB RAM, 2 CPU i 512 procesów, a bezczynny jest usuwany po 20 min. Obraz dla danego języka buduje się raz, przy pierwszym użyciu (`devlingo/<język>:1`).
- **Testy:** to mały harness w danym języku. Wypisuje `PASS nazwa` albo `FAIL nazwa :: opis` i kończy się kodem wyjścia 1, gdy coś nie przeszło. Rozumiany jest też format `go test -v`.
- **Weryfikacja zadań:** przy generowaniu lekcji wzorcowe rozwiązanie musi przejść wszystkie testy, a szablon startowy musi któryś oblać. Działa to w osobnym kontenerze weryfikacyjnym, a gdy coś się nie zgadza, model dostaje jedną prośbę o poprawkę.
- **Piaskownica w menu** to wolny edytor z terminalem w wybranym języku, bez zadania.

Bez Dockera zadania w tych językach ocenia tylko model, a JS/TS dalej działa w Web Workerze w przeglądarce.

Skróty klawiszowe: `Enter` sprawdza odpowiedź albo przechodzi dalej, `1–4` wybiera odpowiedź, a `Ctrl+Enter` działa w polu tekstowym i w edytorze.
W fiszkach `Spacja` odsłania odpowiedź, a `1–4` ją ocenia.
