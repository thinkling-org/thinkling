# Codenoms

[codenoms.org](https://codenoms.org)

Lokalna aplikacja do szybkiej nauki programowania krótkimi lekcjami z grywalizacją. Działa na Twojej
**subskrypcji Claude (Claude Code CLI) albo ChatGPT (Codex CLI)**, więc nie płacisz za tokeny API.

- Opisujesz swoją sytuację, a model układa plan: moduły, lekcje i ocenę poziomu (plan pojawia się na żywo w trakcie generowania).
- Ścieżka nauki: kolejne lekcje, XP, seria dni, cel dzienny i wynik 0–1000.
- Ćwiczenia:
  - **pytania otwarte**: model ocenia odpowiedź (0–10) i wypisuje, co jest dobrze, a co źle,
  - **„co wypisze ten kod?”**: quiz z wyjaśnieniem i przyciskiem „wyjaśnij krok po kroku”,
  - **zadania w edytorze Monaco** (to samo co w VS Code): testy JS/TS uruchamiane w Web Workerze, a review modelu pojawia się jako komentarze przypięte do linii, z przyciskiem „Zastosuj poprawkę”.
- **Fiszki** z powtórkami rozłożonymi w czasie. Twoje błędy automatycznie trafiają do talii.
- „Dopytaj Claude”: czat w kontekście bieżącego ćwiczenia.

## Wymagania

- Node 20.3+
- Zalogowane **Claude Code** (`claude`) **lub** **Codex** (`codex`). Aplikacja sama szuka binarki w PATH,
  `~/.local/bin`, rozszerzeniach VS Code/Cursor i w instalacji Codex. Ścieżkę możesz też podać w Ustawieniach.
- Opcjonalnie: **Docker** (piaskownica z terminalem i głos lektora) oraz **Python 3.10–3.13** (dyktowanie).

## Uruchomienie

```bash
npm install
npm start          # build + serwer → http://localhost:3141
```

albo w trybie deweloperskim:

```bash
npm run dev        # API na :3141 + Vite na http://localhost:5173
```

### Kreator pierwszego uruchomienia

Przy pierwszym otwarciu aplikacja prowadzi przez konfigurację (`/setup`, później dostępna w **Ustawienia → Kreator konfiguracji**):

1. **Silnik AI**: wykrywa Claude Code i Codex, sprawdza zalogowanie (`claude auth status`, `codex login status`) i podaje
   polecenia instalacji lub logowania. Tu wybierasz model i **effort** (wysiłek rozumowania).
2. **Docker**: sprawdza, czy Docker jest zainstalowany, uruchomiony i dostępny bez sudo. Może go zainstalować
   (Linux: `get.docker.com` przez `pkexec`, macOS: Homebrew, Windows: winget) albo uruchomić. Opcjonalnie od razu buduje
   obrazy wybranych języków.
3. **Głos lektora**: na żądanie pobiera wagi ZONOS3-Mini (ok. 1,7 GB) do `data/zonos/models`, buduje obraz
   `codenoms/zonos:1` z [server/zonos/Dockerfile](server/zonos/Dockerfile) i uruchamia kontener `codenoms-zonos`
   (restart razem z Dockerem, port `127.0.0.1:1919`).
4. **Dyktowanie**: tworzy `data/whisper/venv`, instaluje Faster Whisper i pobiera model `small`.

Instalacje działają w tle po stronie serwera, więc odświeżenie strony ich nie przerywa. Pominięte funkcje są ukryte
w interfejsie (np. przycisk **Przeczytaj** pojawia się dopiero, gdy serwer głosu odpowiada).

### Model i effort

W **Ustawieniach** każdy dostawca ma własny wybór modelu i effortu (zapamiętywany przy przełączaniu Claude ↔ Codex):

- **Claude Code**: aliasy `fable`, `opus`, `sonnet`, `haiku` (albo pełny identyfikator) i `--effort low…max`.
- **Codex**: lista modeli pobierana z `codex debug models` wraz z obsługiwanymi poziomami, przekazywana jako
  `-m <model> -c model_reasoning_effort=<poziom>`.

## Czytanie kart wiedzy

Przycisk **Przeczytaj** odtwarza po polsku tytuł i treść karty, wraz z pułapką
i punktami do zapamiętania. Bloki kodu są pomijane, a nazwy w tekście, np.
`console.log`, są odczytywane jako osobne słowa.
Odtwarzacz umożliwia pauzę, przewijanie i powrót do początku. Ostatnie nagrania
są dostępne ponownie w tej samej sesji aplikacji.
Lokalny wariant `backbone-ptq-edit.gguf` obsługuje natywne tokeny pauzy, więc Codenoms
może generować po kilka zdań naraz. Ze starszym wariantem aplikacja dokłada pauzy
podczas składania nagrania.
W **Ustawieniach → Projektowanie głosu** można wylosować syntetyczny głos,
wyregulować jego cechy, odsłuchać własny tekst i zapisać projekt jako głos lekcji.
Projektowanie używa lokalnego pakietu głosów Zyphry i profili z `steer.gguf`.

Codenoms domyślnie łączy się z `http://127.0.0.1:1919` przez API `POST /v2/generate`.
Lokalna konfiguracja Docker używa kontenera `codenoms-zonos` z automatycznym restartem.
Wagi [Zyphra/ZONOS3-Mini](https://huggingface.co/Zyphra/ZONOS3-Mini) są w `data/zonos/models`.
Na innym stanowisku serwer można uruchomić według [instrukcji Zyphry](https://github.com/Zyphra/ZONOS3-Mini#quick-start).
Adres serwera można ustawić przez `ZONOS_URL`:

```bash
ZONOS_URL=http://127.0.0.1:1919 npm run dev
```

Wszystkie głosy są syntetyczne: powstają z pakietu głosów ZONOS3-Mini pobieranego przez kreator.
Bez zapisanego projektu lekcje czyta domyślny projekt głosu z polskim akcentem. Repozytorium nie zawiera
żadnych nagrań ani osadzeń głosu.

## Dyktowanie

W aktywnym polu tekstowym kliknij mikrofon lub użyj **Alt+Shift+M**. Drugie
kliknięcie kończy nagrywanie i wstawia rozpoznany polski tekst w miejscu kursora.
Codenoms przetwarza nagranie lokalnie przez Faster Whisper (model `small`, CPU int8).

Instalacja lokalna używa `data/whisper/venv/bin/python` i wag w `data/whisper/model`.
Na innym komputerze zainstaluj pakiety z `server/whisper-requirements.txt`
w środowisku wirtualnym, pobierz
[model small](https://huggingface.co/Systran/faster-whisper-small) i ustaw
`WHISPER_PYTHON` oraz `WHISPER_MODEL`, jeśli używasz innych ścieżek.

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
- **Izolacja i limity:** kontener nie ma sieci, ma limit 1 GB RAM, 2 CPU i 512 procesów, a bezczynny jest usuwany po 20 min. Obraz dla danego języka buduje się raz, przy pierwszym użyciu (`codenoms/<język>:1`).
- **Testy:** to mały harness w danym języku. Wypisuje `PASS nazwa` albo `FAIL nazwa :: opis` i kończy się kodem wyjścia 1, gdy coś nie przeszło. Rozumiany jest też format `go test -v`.
- **Weryfikacja zadań:** przy generowaniu lekcji wzorcowe rozwiązanie musi przejść wszystkie testy, a szablon startowy musi któryś oblać. Działa to w osobnym kontenerze weryfikacyjnym, a gdy coś się nie zgadza, model dostaje jedną prośbę o poprawkę.
- **Piaskownica w menu** to wolny edytor z terminalem w wybranym języku, bez zadania.

Bez Dockera zadania w tych językach ocenia tylko model, a JS/TS dalej działa w Web Workerze w przeglądarce.

Skróty klawiszowe: `Enter` sprawdza odpowiedź albo przechodzi dalej, `1–4` wybiera odpowiedź, a `Ctrl+Enter` działa w polu tekstowym i w edytorze.
W fiszkach `Spacja` odsłania odpowiedź, a `1–4` ją ocenia.

## Autor

Codenoms stworzył [Konrad Ciurkiewicz](https://github.com/konradciurkiewicz). Zgłoszenia błędów, pomysły i pull requesty są mile widziane.

## Licencja

Codenoms jest darmowe i otwarte, na licencji [Apache License 2.0](LICENSE). Możesz go używać, zmieniać i rozpowszechniać,
także komercyjnie, pod warunkiem zachowania informacji o prawach autorskich i licencji (zob. [NOTICE](NOTICE)).
Licencja nie obejmuje praw do nazwy ani logo projektu.
