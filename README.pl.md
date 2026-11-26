<p align="center"><img src="public/logo.svg" width="112" alt="" /></p>

# Thinkling

[Thinkling na GitHubie](https://github.com/thinkling-org/thinkling) · [English](README.md) · **Polski**

Lokalna aplikacja do szybkiej nauki programowania krótkimi lekcjami z grywalizacją. Działa na Twojej
**subskrypcji Claude (Claude Code CLI) albo ChatGPT (Codex CLI)**, więc nie płacisz za tokeny API.

Interfejs jest dostępny po **polsku i angielsku**. Przy pierwszym uruchomieniu Thinkling zapisuje preferowany
język systemu w wersji desktopowej lub język przeglądarki w wersji webowej. Przy innym języku interfejs jest
angielski, a nowe odpowiedzi AI powstają w zapisanym języku. Zmienisz go w **Ustawieniach → Język**.

- Opisujesz swoją sytuację, a model układa plan: moduły, lekcje i ocenę poziomu (plan pojawia się na żywo w trakcie generowania).
- Ścieżka nauki: kolejne lekcje, XP, seria dni, cel dzienny i wynik 0–1000.
- Ćwiczenia:
  - **pytania otwarte**: model ocenia odpowiedź (0–10) i wypisuje, co jest dobrze, a co źle,
  - **„co wypisze ten kod?”**: quiz z wyjaśnieniem i przyciskiem „wyjaśnij krok po kroku”,
  - **zadania w edytorze Monaco** (to samo co w VS Code): testy JS/TS uruchamiane w Web Workerze, a review modelu pojawia się jako komentarze przypięte do linii, z przyciskiem „Zastosuj poprawkę”.
- **Fiszki** z powtórkami rozłożonymi w czasie. Twoje błędy automatycznie trafiają do talii.
- „Dopytaj Claude”: czat w kontekście bieżącego ćwiczenia.

## Wymagania

- Node.js 24.15.0 lub nowszy do instalacji zależności i budowania ze źródeł. Wersję deweloperską Node.js 24 LTS wskazuje plik [`.nvmrc`](.nvmrc). Instalator Windows zawiera środowisko uruchomieniowe.
- Zalogowane **Claude Code** (`claude`) **lub** **Codex** (`codex`). Aplikacja sama szuka binarki w PATH,
  `~/.local/bin`, rozszerzeniach VS Code/Cursor i w instalacji Codex. Ścieżkę możesz też podać w Ustawieniach.
- Opcjonalnie: **Docker** (piaskownica z terminalem) oraz **Python 3.10–3.13** (dyktowanie).

## Uruchomienie

```bash
npm install
npm start          # build + serwer → http://localhost:3141
```

albo w trybie deweloperskim:

```bash
npm run dev        # API na :3141 + Vite na http://localhost:5173
```

`npm run typecheck` sprawdza typy we frontendzie Vue, serwerze i Electronie. Build produkcyjny zapisuje interfejs w `dist/`, a skompilowany kod serwera i Electrona w `dist-node/`.

### Aplikacja desktopowa na Windows

```powershell
npm.cmd ci
npm.cmd run desktop          # buduje interfejs i otwiera okno Electrona
npm.cmd run desktop:package  # tworzy instalator .exe w katalogu release/
```

Electron sam uruchamia lokalny serwer na czas działania aplikacji. Dane desktopowe trafiają do
`%APPDATA%\Thinkling\data`. Aby otworzyć istniejący plan, postępy i lokalne środowiska z wersji
przeglądarkowej, zamknij jej serwer i ustaw `THINKLING_DATA` na dotychczasowy katalog danych.
Poniższe polecenia uruchom w PowerShellu z katalogu repozytorium.

```powershell
$env:THINKLING_DATA = (Resolve-Path .\data).Path
npm.cmd run desktop
```

### Aktualizacje aplikacji i wydania

Thinkling to nowa nazwa Codenoms. Dotychczasowe instalacje desktopowe automatycznie korzystają z
`%APPDATA%\Codenoms\data`, jeśli nowy katalog Thinkling nie zawiera zapisanej bazy. Dane pozostają
na miejscu, żeby zachować środowiska Pythona i ścieżki kontenerów Dockera. `THINKLING_DATA` pozwala
wybrać katalog danych; poprzednia zmienna `CODENOMS_DATA` nadal działa jako opcja zgodności.
Wewnętrzny identyfikator aplikacji Windows i nazwy zasobów Dockera również pozostają bez zmian.

Zainstalowana aplikacja Windows sprawdza publiczne [GitHub Releases](https://github.com/thinkling-org/thinkling/releases)
przy uruchomieniu i co sześć godzin. Przycisk **Dostępna aktualizacja** rozpoczyna pobieranie, pokazuje
postęp, a następnie zmienia się w **Uruchom ponownie i zaktualizuj**. Pobieranie i restart wymagają
kliknięcia. Zwykłe zamknięcie aplikacji nie instaluje pobranej aktualizacji. W ustawieniach są wersja,
ręczne sprawdzanie i lista zmian. W przeglądarce te elementy są ukryte, a w desktopowym trybie developerskim
sprawdzanie jest wyłączone.

Przed restartem musi udać się zapis postępu. Dotychczasowa sekwencja zamykania Electrona zapisuje stan
i zatrzymuje lokalny backend przed wyjściem. Dane pozostają w `%APPDATA%\Thinkling\data` lub `THINKLING_DATA`.

Po zatwierdzeniu zmian na `main` przygotuj kolejną wersję:

```bash
npm version patch
git push origin main --follow-tags
```

Workflow `Windows release` sprawdza zgodność tagu `v*` z wersją w `package.json`, uruchamia testy i
sprawdzanie typów, buduje instalator NSIS x64 i dodaje go do **szkicu wydania**. Pobierz i sprawdź
instalator, a potem opublikuj szkic na GitHubie. Zachowaj razem wszystkie wygenerowane pliki `.exe`,
`.blockmap` i `latest.yml`. Do użytkowników trafiają opublikowane wydania stabilne. Repozytorium wydań
musi być publiczne. Token publikowania pozostaje w GitHub Actions i nie trafia do aplikacji.

Podpisywanie Windows Authenticode korzysta z sekretów repozytorium `WINDOWS_CSC_LINK` (adres lub PFX
w base64 obsługiwany przez electron-builder) i `WINDOWS_CSC_KEY_PASSWORD`. Bez nich instalator będzie
niepodpisany. Podpisywanie należy skonfigurować przed szerszą dystrybucją; pozwala też updaterowi
zweryfikować wydawcę aktualizacji. Nie wyłączaj sprawdzania podpisu.

Pierwsze wydanie z updaterem trzeba zainstalować ręcznie. Przed publikacją sprawdź aktualizację
rzeczywiście zainstalowanej wersji A do wyższej B: wykrywanie, pobieranie, ponowienie po utracie sieci,
restart i zachowanie planu, postępu oraz ustawień. Użyj osobnego publicznego repozytorium testowego
i lokalnie zmienionego `build.publish`, żeby wydania testowe nie trafiały do użytkowników. Sprawdź też,
że zwykłe zamknięcie aplikacji nie instaluje pobranej wersji. `npm run desktop:package` buduje lokalnie
bez publikowania, a `npm run desktop:release` wysyła szkic przy użyciu `GH_TOKEN` i jest przeznaczone
dla workflow wydań. Tryb developerski i testy jednostkowe nie zastępują testu dwóch instalatorów.

Po zbudowaniu paczki `npm run test:desktop-updates` sprawdza spakowany proces główny, preload w sandboxie,
kontrolę dostępu IPC, polskie przyciski, postęp pobierania, symulowany błąd zapisu z ponowieniem i zamknięcie
aplikacji. Używa odizolowanych danych i symulowanego transportu aktualizacji; nie uruchamia instalatora.
Workflow wydań również wykonuje ten test. Zrzut interfejsu zapisuje się w `release/update-smoke.png`.

### Kreator pierwszego uruchomienia

Przy pierwszym otwarciu aplikacja prowadzi przez konfigurację (`/setup`, później dostępna w **Ustawienia → Kreator konfiguracji**):

1. **Silnik AI**: wykrywa Claude Code i Codex, sprawdza zalogowanie (`claude auth status`, `codex login status`) i podaje
   polecenia instalacji lub logowania. Tu wybierasz model i **effort** (wysiłek rozumowania).
2. **Docker**: sprawdza, czy Docker jest zainstalowany, uruchomiony i dostępny bez sudo. Może go zainstalować
   (Linux: `get.docker.com` przez `pkexec`, macOS: Homebrew, Windows: winget) albo uruchomić. Opcjonalnie od razu buduje
   obrazy wybranych języków.
3. **Dyktowanie**: tworzy `data/whisper/venv`, instaluje Faster Whisper i pobiera model `small`.

Instalacje działają w tle po stronie serwera, więc odświeżenie strony ich nie przerywa.

### Model i effort

W **Ustawieniach** każdy dostawca ma własny wybór modelu i effortu (zapamiętywany przy przełączaniu Claude ↔ Codex):

- **Claude Code**: aliasy `fable`, `opus`, `sonnet`, `haiku` (albo pełny identyfikator) i `--effort low…max`.
- **Codex**: lista modeli pobierana z `codex debug models` wraz z obsługiwanymi poziomami, przekazywana jako
  `-m <model> -c model_reasoning_effort=<poziom>`.

## Dyktowanie

W aktywnym polu tekstowym kliknij mikrofon lub użyj **Alt+Shift+M**. Drugie
kliknięcie kończy nagrywanie i wstawia rozpoznany tekst w miejscu kursora.
Thinkling przetwarza nagranie lokalnie przez Faster Whisper (model `small`, CPU int8).

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
- Prompty i schematy są w [server/prompts.ts](server/prompts.ts), a uruchamianie CLI w [server/providers.ts](server/providers.ts).
- Testy zadań JS/TS działają w przeglądarce ([src/lib/runner.worker.ts](src/lib/runner.worker.ts)): `test`, `expect`, `mockFn`, `sleep`.
  TypeScript jest transpilowany przez worker TS z Monaco. Rozwiązania w innych językach ocenia sam model, bez uruchamiania kodu.

## Piaskownica (Docker): prawdziwy edytor i terminal

Gdy działa Docker, zadania w PHP, C++, Pythonie, Go, Ruście, Javie, C#, Ruby i SQL (a opcjonalnie też JS/TS) wykonują się w prawdziwych kontenerach. Kod jest w [server/sandbox.ts](server/sandbox.ts).

- **Workspace:** każde zadanie ma własny katalog `data/workspaces/<id>`, podmontowany w kontenerze jako `/workspace`. Edytor Monaco z drzewem plików zapisuje zmiany prosto na dysk.
- **Terminal:** prawdziwy `bash` w kontenerze (xterm.js połączony przez WebSocket).
- **Izolacja i limity:** kod działa jako zwykły użytkownik, nie root (na Linuksie z Twoim UID), bez żadnych uprawnień jądra (capabilities) i z `no-new-privileges`. Kontener nie ma sieci, ma limit 1 GB RAM (bez swapu), 2 CPU i 512 procesów, a bezczynny jest usuwany po 20 min. Obraz dla danego języka buduje się raz, przy pierwszym użyciu (`codenoms/<język>:2`).
- **Testy:** to mały harness w danym języku. Wypisuje `PASS nazwa` albo `FAIL nazwa :: opis` i kończy się kodem wyjścia 1, gdy coś nie przeszło. Rozumiany jest też format `go test -v`.
- **Weryfikacja zadań:** przy generowaniu lekcji wzorcowe rozwiązanie musi przejść wszystkie testy, a szablon startowy musi któryś oblać. Działa to w osobnym kontenerze weryfikacyjnym, a gdy coś się nie zgadza, model dostaje jedną prośbę o poprawkę.
- **Piaskownica w menu** to wolny edytor z terminalem w wybranym języku, bez zadania.

Bez Dockera zadania w tych językach ocenia tylko model, a JS/TS dalej działa w Web Workerze w przeglądarce.

Skróty klawiszowe: `Enter` sprawdza odpowiedź albo przechodzi dalej, `1–4` wybiera odpowiedź, a `Ctrl+Enter` działa w polu tekstowym i w edytorze.
W fiszkach `Spacja` odsłania odpowiedź, a `1–4` ją ocenia.

## Bezpieczeństwo

Thinkling jest przeznaczone do uruchamiania wyłącznie na własnym komputerze. Serwer nasłuchuje na `127.0.0.1`
i odrzuca żądania z obcych źródeł. Nie wystawiaj go do sieci (np. przez `HOST=0.0.0.0`): każdy, kto się do niego
dostanie, ma terminal w piaskownicy i może zmienić binarkę uruchamianą przez aplikację.

## Autor

Thinkling stworzył [Konrad Ciurkiewicz](https://github.com/konradciurkiewicz). Zgłoszenia błędów, pomysły i pull requesty są mile widziane.

## Licencja

Thinkling jest darmowe i otwarte, na licencji [Apache License 2.0](LICENSE). Możesz go używać, zmieniać i rozpowszechniać,
także komercyjnie, pod warunkiem zachowania informacji o prawach autorskich i licencji (zob. [NOTICE](NOTICE)).
Licencja nie obejmuje praw do nazwy ani logo projektu.
