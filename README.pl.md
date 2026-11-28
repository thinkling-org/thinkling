<p align="center"><img src="public/logo.svg" width="112" alt="Logo Thinkling" /></p>

<h1 align="center">Thinkling</h1>

<p align="center">
  <strong>Ucz się programować krótkimi lekcjami z grywalizacją, które przygotowuje AI z Twojej subskrypcji.</strong>
</p>

<p align="center">
  <a href="https://thinkling.org"><strong>Strona</strong></a> ·
  <a href="https://thinkling.org/#download"><strong>Pobierz</strong></a> ·
  <a href="https://github.com/thinkling-org/thinkling/releases">Wydania</a> ·
  <a href="README.md">English</a> · <strong>Polski</strong>
</p>

Thinkling to darmowa aplikacja open source, która zamienia **Claude Code** albo **Codex** w osobistego
nauczyciela programowania. Opisujesz, co już umiesz i czego chcesz się nauczyć, a Thinkling układa dla Ciebie
kurs: moduły, lekcje, ćwiczenia i ocenę poziomu. Uczysz się w krótkich sesjach z XP, seriami dni i fiszkami,
piszesz prawdziwy kod w edytorze znanym z VS Code i dostajesz informację zwrotną do każdej odpowiedzi.

Wszystko działa na Twoim komputerze i korzysta z Twojej **subskrypcji Claude lub ChatGPT** przez oficjalne
CLI, więc nie konfigurujesz klucza API i nie płacisz za tokeny.

## Funkcje

- **Plan dopasowany do Ciebie.** Opisujesz swoją sytuację, a model układa moduły, lekcje i ocenę poziomu.
  Plan pojawia się na żywo w trakcie generowania.
- **Ścieżka nauki, która motywuje.** Lekcje, XP, seria dni, cel dzienny i wynik 0–1000.
- **Różne rodzaje ćwiczeń:**
  - **pytania otwarte**: model ocenia odpowiedź (0–10) i wypisuje, co jest dobrze, a co źle,
  - **„co wypisze ten kod?”**: quiz z wyjaśnieniem i przyciskiem „wyjaśnij krok po kroku”,
  - **zadania w edytorze Monaco**: testy JS/TS uruchamiane w Web Workerze, a review modelu pojawia się jako
    komentarze przypięte do linii, z przyciskiem „Zastosuj poprawkę”.
- **Prawdziwa piaskownica.** Z Dockerem zadania w PHP, C++, Pythonie, Go, Ruście, Javie, C#, Ruby i SQL działają
  w odizolowanych kontenerach z drzewem plików i terminalem.
- **Fiszki** z powtórkami rozłożonymi w czasie. Twoje błędy automatycznie trafiają do talii.
- **„Dopytaj Claude”**: czat w kontekście bieżącego ćwiczenia.
- **Lokalne dyktowanie** z Faster Whisper: odpowiadasz głosem zamiast pisać.
- Interfejs **po polsku i angielsku**. Przy pierwszym uruchomieniu Thinkling wybiera język systemu lub
  przeglądarki, a nowe odpowiedzi AI powstają w tym języku. Zmienisz go w **Ustawieniach → Język**.

## Szybki start

Najprościej zacząć od aplikacji desktopowej.

1. **Pobierz Thinkling** ze strony **[thinkling.org](https://thinkling.org/#download)**. Strona zawsze prowadzi
   do najnowszego wydania. Instalator na Windows jest już dostępny; wersje na macOS i Linuksa są w przygotowaniu,
   a do tego czasu możesz [uruchomić Thinkling ze źródeł](#uruchomienie-ze-źródeł).
2. **Zainstaluj silnik AI i zaloguj się**: [Claude Code](https://docs.claude.com/en/docs/claude-code) (`claude`)
   z subskrypcją Claude **albo** [Codex CLI](https://github.com/openai/codex) (`codex`) z subskrypcją ChatGPT.
3. **Otwórz Thinkling.** [Kreator konfiguracji](#kreator-pierwszego-uruchomienia) znajdzie CLI, sprawdzi
   logowanie i może skonfigurować Dockera oraz dyktowanie. Potem opisz, czego chcesz się nauczyć.

Zainstalowana aplikacja aktualizuje się z [GitHub Releases](https://github.com/thinkling-org/thinkling/releases).
Informuje o nowej wersji i instaluje ją dopiero po kliknięciu **Uruchom ponownie i zaktualizuj**.

### Wymagania

| | |
|---|---|
| **Wymagane** | Zalogowane Claude Code (`claude`) **lub** Codex (`codex`). Thinkling szuka binarki w `PATH`, `~/.local/bin`, rozszerzeniach VS Code/Cursor i w instalacji Codex. Ścieżkę możesz też podać w Ustawieniach. |
| **Opcjonalne** | **Docker** do piaskownicy i terminala. **Python 3.10–3.13** do dyktowania. |
| **Tylko ze źródeł** | **Node.js 24.15.0** lub nowszy. [`.nvmrc`](.nvmrc) wskazuje Node.js 24 LTS. Instalator Windows zawiera własne środowisko uruchomieniowe. |

## Uruchomienie ze źródeł

Sklonuj repozytorium i zainstaluj zależności:

```bash
git clone https://github.com/thinkling-org/thinkling.git
cd thinkling
npm ci
```

Następnie wybierz sposób uruchomienia.

### Aplikacja desktopowa (Electron)

```bash
npm run desktop            # buduje aplikację i otwiera okno Electrona
npm run desktop:package    # opcjonalnie: tworzy instalator dla bieżącego systemu w katalogu release/
                           # (Windows .exe, macOS .dmg/.zip, Linux AppImage/.deb)
```

Jeśli PowerShell blokuje skrypty npm, użyj `npm.cmd` zamiast `npm`.

Electron uruchamia lokalny serwer na czas działania okna. Na Windows dane trafiają do
`%APPDATA%\Thinkling\data`.

### W przeglądarce

```bash
npm start                  # buduje aplikację i uruchamia serwer
```

Następnie otwórz **http://localhost:3141**. Dane trafiają do katalogu `data/` w repozytorium.

### Tryb deweloperski

```bash
npm run dev                # API na :3141 + Vite z hot reload na http://localhost:5173
```

### Przenoszenie danych między wersją przeglądarkową a desktopową

Wersja przeglądarkowa i desktopowa mają osobne dane. Aby otworzyć plan, postępy i lokalne środowiska
z przeglądarki w aplikacji desktopowej, zamknij serwer przeglądarkowy i ustaw `THINKLING_DATA` na jego katalog
danych. W PowerShellu z katalogu repozytorium:

```powershell
$env:THINKLING_DATA = (Resolve-Path .\data).Path
npm.cmd run desktop
```

## Kreator pierwszego uruchomienia

Przy pierwszym otwarciu aplikacja prowadzi przez konfigurację (`/setup`, później dostępna w **Ustawienia → Kreator konfiguracji**):

1. **Silnik AI**: wykrywa Claude Code i Codex, sprawdza zalogowanie (`claude auth status`, `codex login status`) i podaje
   polecenia instalacji lub logowania. Tu wybierasz model i **effort** (wysiłek rozumowania).
2. **Docker**: sprawdza, czy Docker jest zainstalowany, uruchomiony i dostępny bez sudo. Może go zainstalować
   (Linux: `get.docker.com` przez `pkexec`, macOS: Homebrew, Windows: winget) albo uruchomić. Opcjonalnie od razu buduje
   obrazy wybranych języków.
3. **Dyktowanie**: tworzy `data/whisper/venv`, instaluje Faster Whisper i pobiera model `small`.

Instalacje działają w tle po stronie serwera, więc odświeżenie strony ich nie przerywa.

## Model i effort

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

## Rozwój

`npm run typecheck` sprawdza typy we frontendzie Vue, serwerze i Electronie. Build produkcyjny zapisuje interfejs
w `dist/`, a skompilowany kod serwera i Electrona w `dist-node/`.

Teksty interfejsu mają angielskie komunikaty źródłowe w `t()`. Polskie tłumaczenia dodaj do
[`src/locales/pl.ts`](src/locales/pl.ts).

### Testy

```bash
npm test                 # testy jednostkowe, komponentów i integracji API
npm run test:coverage    # raport pokrycia w coverage/index.html
npm run typecheck        # kontrola typów aplikacji i testów
```

CI uruchamia pomiar pokrycia z globalnymi progami: 80% instrukcji, 65% gałęzi,
75% funkcji i 80% linii dla katalogów `src/`, `server/` i `electron/`.
Testy obejmują lekcje i powtórki, ekrany planu i ustawień, bloki edukacyjne, wykonywanie kodu,
zapis plików, dyktowanie i lokalne API. W testach komponentów Monaco, Web Audio, nagrywanie
mikrofonu i połączenia terminala są symulowane. Prawdziwe uruchamianie Dockera i CLI wymaga
skonfigurowanego środowiska. Paczka desktopowa i aktualizacje instalatora mają osobne testy smoke
opisane poniżej.

Testy E2E w prawdziwej przeglądarce uruchamia Playwright na produkcyjnym buildzie:

```bash
npx playwright install chromium  # jednorazowo po npm install
npm run test:e2e                 # build i scenariusze Chromium
npm run test:e2e:ui              # tryb interaktywny
npm run test:e2e:report          # raport HTML z ostatniego przebiegu
npx playwright install firefox webkit
npm run test:e2e:all             # Chromium, Firefox, WebKit i mobilny Chromium
```

Każdy scenariusz ma własny serwer Express, losowy port i tymczasowy katalog danych.
Testy sprawdzają prawdziwy zapis przez HTTP, routing, Monaco i wykonywanie kodu w Web Workerze.
Deterministyczne CLI zastępuje Claude/Codex, a transport Dockera i polecenia systemowe są
odizolowane w narzędziach testowych. Testy nie wymagają logowania i nie zmieniają Twoich danych.
CI uruchamia cztery konfiguracje przeglądarek i zapisuje raport, ślady wykonania, filmy,
zrzuty ekranu oraz logi serwera dla nieudanych testów.

[Mapa pokrycia E2E](docs/e2e-tests.md) opisuje scenariusze i pozostałe testy wymagające
skonfigurowanego środowiska. Pokrycie scenariuszy E2E nie oznacza 100% pokrycia linii ani gałęzi.
Pokrycie kodu istniejących testów jednostkowych, komponentowych i API mierzy `test:coverage`.

### Aktualizacje aplikacji i wydania

Thinkling to nowa nazwa Codenoms. Dotychczasowe instalacje desktopowe automatycznie korzystają z
`%APPDATA%\Codenoms\data`, jeśli nowy katalog Thinkling nie zawiera zapisanej bazy. Dane pozostają
na miejscu, żeby zachować środowiska Pythona i ścieżki kontenerów Dockera. `THINKLING_DATA` pozwala
wybrać katalog danych; poprzednia zmienna `CODENOMS_DATA` nadal działa jako opcja zgodności.
Wewnętrzny identyfikator aplikacji Windows i nazwy zasobów Dockera również pozostają bez zmian.

Zainstalowana aplikacja Windows sprawdza publiczne [GitHub Releases](https://github.com/thinkling-org/thinkling/releases)
przy uruchomieniu i co sześć godzin. Aktualizacja znaleziona przy starcie otwiera okno z przyciskami
**Pobierz aktualizację** i **Później**. Można je zamknąć przyciskiem Później lub Escape; pojawia się raz
na sesję aplikacji. Sprawdzanie okresowe i ręczne korzysta z przycisku w nagłówku. Przycisk **Dostępna aktualizacja** rozpoczyna pobieranie, pokazuje
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
bez publikowania, a `npm run desktop:release:win` (oraz `:mac`, `:linux`) wysyła szkic przy użyciu `GH_TOKEN` i jest przeznaczone
dla workflow wydań. Tryb developerski i testy jednostkowe nie zastępują testu dwóch instalatorów.

Po zbudowaniu paczki `npm run test:desktop-updates` sprawdza spakowany proces główny, preload w sandboxie,
kontrolę dostępu IPC, polskie przyciski, postęp pobierania, symulowany błąd zapisu z ponowieniem i zamknięcie
aplikacji. Używa odizolowanych danych i symulowanego transportu aktualizacji; nie uruchamia instalatora.
Workflow wydań również wykonuje ten test. Zrzut interfejsu zapisuje się w `release/update-smoke.png`.

Na Windows `npm run test:installer-lifecycle` buduje dodatkowo dwie małe aplikacje z osobnym identyfikatorem
testowym i produkcyjnym skryptem uruchamiania NSIS. Sprawdza prawdziwą instalację, aktualizację przez
`electron-updater`, automatyczny ponowny start i zachowanie danych, a następnie odinstalowuje aplikację
testową. Workflow wydań również wykonuje ten test. Dane, logi i instalatory testowe pozostają w `release/`.
Zwykła instalacja użytkownika uruchamia plik `.exe` bezpośrednio; podniesione uprawnienia instalatora
wymagają uruchomienia aplikacji z tokenem zwykłego użytkownika.

## Autor

Thinkling stworzył [Konrad Ciurkiewicz](https://github.com/konradciurkiewicz). Zgłoszenia błędów, pomysły i pull requesty są mile widziane.

## Licencja

Thinkling jest darmowe i otwarte, na licencji [Apache License 2.0](LICENSE). Możesz go używać, zmieniać i rozpowszechniać,
także komercyjnie, pod warunkiem zachowania informacji o prawach autorskich i licencji (zob. [NOTICE](NOTICE)).
Licencja nie obejmuje praw do nazwy ani logo projektu.
