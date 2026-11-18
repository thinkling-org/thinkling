// Prompty i schematy JSON dla każdego zadania.
// Schematy są w trybie "strict" (wszystkie pola wymagane, brak dodatkowych),
// bo tego wymaga Codex (--output-schema); Claude (--json-schema) przyjmuje je bez zmian.

const str = { type: 'string' }
const int = { type: 'integer' }
const bool = { type: 'boolean' }
const arr = (items) => ({ type: 'array', items })
const obj = (properties) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
})

import { envFor } from './sandbox.js'

export const LANGUAGES = [
  'javascript', 'typescript', 'python', 'go', 'rust', 'java', 'csharp', 'cpp',
  'php', 'ruby', 'kotlin', 'swift', 'sql', 'other',
]
const LESSON_KINDS = ['theory', 'output', 'code', 'mixed', 'test']

export const SYSTEM_JSON = `Jesteś DevLingo — wymagającym, konkretnym trenerem programowania dla doświadczonych developerów.
Tworzysz materiały po polsku (terminy techniczne mogą zostać po angielsku). Piszesz zwięźle, technicznie, bez lania wody i bez emoji.
Treści tekstowe formatujesz w Markdown (inline \`kod\`, bloki \`\`\`lang). Nie używasz narzędzi.
Zwracasz wyłącznie dane zgodne z podanym schematem JSON.`

export const SYSTEM_CHAT = `Jesteś DevLingo — trenerem programowania dla doświadczonych developerów.
Odpowiadasz po polsku, zwięźle i technicznie, w Markdown (bloki kodu z językiem). Bez emoji, bez wstępów typu "Świetne pytanie".
Nie używasz narzędzi.`

// ---------------------------------------------------------------- plan

const planSchema = obj({
  title: str,
  summary: str,
  goal: str,
  level: str,
  levelSummary: str,
  language: { type: 'string', enum: LANGUAGES },
  durationWeeks: int,
  weakSpots: arr(str),
  modules: arr(
    obj({
      title: str,
      week: int,
      description: str,
      lessons: arr(
        obj({
          title: str,
          kind: { type: 'string', enum: LESSON_KINDS },
          focus: str,
        }),
      ),
    }),
  ),
})

const STYLE_LABEL = {
  code: 'więcej kodu i zadań praktycznych, mało teorii',
  balanced: 'balans teorii i praktyki',
  theory: 'więcej pytań teoretycznych i rozumienia mechanizmów',
}

function planRules() {
  return `Zasady planu:
- Kolejność pól ma znaczenie (jest strumieniowana do UI): najpierw "title", "summary", "goal", "level", "levelSummary", potem reszta.
- "title": chwytliwy, max 6 słów. "summary": 1–2 zdania. "goal": 1 zdanie, max 20 słów.
- Oceń poziom ucznia: "level" = jedno z "Junior", "Mid", "Senior", "Lead"; "levelSummary" = 1–2 zdania o głównych lukach.
- "weakSpots": 3–6 krótkich (1–3 słowa) haseł, które najpewniej są lukami.
- 4–8 modułów, każdy 5–8 lekcji. Moduły ułożone od fundamentów do zaawansowanych. "week" = numer tygodnia (od 1).
- "durationWeeks" realne dla zadeklarowanego czasu dziennie.
- Każda lekcja ma "kind":
  - "theory": nowe pojęcie: karta wiedzy → quiz → "wyjaśnij własnymi słowami" na końcu,
  - "output": "co wypisze ten kod?" / przewidywanie zachowania (też poprzedzone krótką kartą wiedzy),
  - "code": zadania w edytorze (napisz funkcję/klasę, napraw bug),
  - "mixed": mieszanka powyższych,
  - "test": sprawdzian modułu — zawsze OSTATNIA lekcja każdego modułu.
- "focus": 1 zdanie co dokładnie lekcja ćwiczy (konkretne pojęcia, API, pułapki).
- Tytuły lekcji krótkie (2–5 słów), konkretne.
- "language": główny język programowania planu (do edytora kodu).
- Unikaj banałów dla seniora; celuj w niuanse i pytania rekrutacyjne, jeśli to cel.`
}

export function planTask({ description, minutesPerDay, style }) {
  return {
    schema: planSchema,
    prompt: `Ułóż spersonalizowany plan treningowy nauki programowania w stylu Duolingo (krótkie lekcje, ścieżka modułów).

## Opis ucznia (jego własnymi słowami)
${description}

## Preferencje
- Czas dziennie: ${minutesPerDay} min
- Styl nauki: ${STYLE_LABEL[style] || STYLE_LABEL.balanced}

${planRules()}`,
  }
}

export function refinePlanTask({ description, minutesPerDay, style, plan, feedback }) {
  const slim = {
    ...plan,
    modules: plan.modules.map((m) => ({
      title: m.title,
      week: m.week,
      description: m.description,
      lessons: m.lessons.map((l) => ({ title: l.title, kind: l.kind, focus: l.focus, done: l.status === 'done' })),
    })),
  }
  return {
    schema: planSchema,
    prompt: `Popraw istniejący plan nauki zgodnie z uwagami ucznia. Zachowaj lekcje oznaczone "done": true bez zmian (te same tytuły, ta sama kolejność na początku modułu), chyba że uczeń wprost prosi inaczej.

## Opis ucznia
${description}
Czas dziennie: ${minutesPerDay} min · Styl: ${STYLE_LABEL[style] || STYLE_LABEL.balanced}

## Obecny plan (JSON)
${JSON.stringify(slim, null, 1)}

## Uwagi ucznia
${feedback}

${planRules()}
Zwróć cały poprawiony plan.`,
  }
}

// ---------------------------------------------------------------- lekcja

const exerciseSchema = obj({
  type: { type: 'string', enum: ['learn', 'choice', 'code', 'open'] },
  warmup: bool,
  prompt: str,
  code: str,
  codeLanguage: str,
  options: arr(str),
  correctIndex: int,
  explanation: str,
  referenceAnswer: str,
  keyPoints: arr(str),
  title: str,
  requirements: arr(str),
  example: str,
  fileName: str,
  starterCode: str,
  tests: str,
  solution: str,
  // tryb "docker": prawdziwy projekt w kontenerze
  files: arr(obj({ path: str, content: str })),
  testFiles: arr(obj({ path: str, content: str })),
  solutionFiles: arr(obj({ path: str, content: str })),
  testCommand: str,
})

const lessonSchema = obj({
  exercises: arr(exerciseSchema),
  flashcards: arr(obj({ front: str, back: str })),
})

// Kolejność wg dydaktyki: (rozgrzewka) → nauka → rozpoznawanie → zastosowanie → wyjaśnienie własnymi słowami.
const KIND_MIX = {
  theory: '1 × "choice" rozgrzewka (warmup), 1–2 × "learn", 2 × "choice" (rozpoznawanie, rosnąca trudność), 1 × "code" albo trudniejszy "choice" (zastosowanie), 1 × "open" NA KOŃCU',
  output: '1 × "choice" rozgrzewka (warmup, output), 1 × "learn", 3 × "choice" typu "co wypisze ten kod?" (warianty przykładu z karty, rosnąca trudność), 1 × "open" NA KOŃCU (dlaczego tak działa)',
  code: '1 × "learn" (technika/wzorzec z przykładem), 1 × "choice" (rozpoznanie), 2 × "code" (łatwiejsze → trudniejsze)',
  mixed: '1 × "choice" rozgrzewka (warmup), 1 × "learn", 2 × "choice" (w tym min. 1 "co wypisze kod"), 1 × "code", 1 × "open" NA KOŃCU',
  test: 'BEZ "learn" i bez rozgrzewki: 6–8 ćwiczeń mieszanych z całego modułu ("choice" output, 1–2 × "code", 1–2 × "open"), trudność wyższa',
}

const RUNNABLE = ['javascript', 'typescript']

function dockerRules(lang) {
  const env = envFor(lang)
  return `Zadania "code" są uruchamiane NAPRAWDĘ — w kontenerze Docker (${env?.label || lang}, bash, katalog roboczy /workspace), BEZ dostępu do sieci: tylko biblioteka standardowa języka, żadnych pakietów (composer require / pip install / npm i / go get nie zadziałają). Uczeń ma prawdziwy edytor z drzewem plików i terminal.
- "files": pliki startowe projektu [{path, content}] — ścieżki względne (np. "src/Cart.php"), kod z sygnaturami + komentarzami TODO, BEZ rozwiązania. 1–3 pliki, mały, czytelny projekt.
- "testFiles": testy [{path, content}] w katalogu "tests/" — WŁASNY minimalny harness w czystym ${lang} (bez frameworków testowych). Dla KAŻDEGO testu wypisuje dokładnie jedną linię na stdout:
    PASS <nazwa testu>
    FAIL <nazwa testu> :: <krótko: expected X, got Y>
  Wyjątek / błąd w jednym teście = FAIL tego testu, a nie przerwanie całości (tam, gdzie język pozwala). Na końcu kod wyjścia 1, jeśli cokolwiek oblało, inaczej 0. 3–6 testów, deterministyczne, szybkie.
- "testCommand": JEDNA komenda bash uruchamiana w /workspace, która kompiluje (jeśli trzeba) i odpala testy, np. \`${env?.testExample || 'bash tests/run.sh'}\`. Artefakty kompilacji zapisuj do /tmp.
- "solutionFiles": wzorcowe wersje plików z "files" (te same ścieżki), z którymi testy przechodzą.
- "fileName": główny plik do edycji (ścieżka z "files"). "starterCode", "tests", "solution": "" (nieużywane).`
}

function codeRules(lang, runtime) {
  if (runtime === 'docker') return dockerRules(lang)
  if (RUNNABLE.includes(lang) && runtime !== 'review') {
    return `Zadania "code" w ${lang} są uruchamiane automatycznie w przeglądarce:
- "starterCode": sygnatura funkcji/klasy + komentarz TODO, BEZ rozwiązania. Zwykłe deklaracje (\`function foo(){}\`, \`class Foo {}\`), bez import/export/require.
- "tests": kod JS (nawet przy TypeScript piszesz testy w czystym JS), który odwołuje się do funkcji ze starterCode po nazwie. Dostępne globalnie:
  \`test(nazwa, async () => {...})\`, \`expect(x).toBe/toEqual/toBeTruthy/toBeFalsy/toContain/toHaveLength/toBeCloseTo/toBeGreaterThan/toBeLessThan/toBeInstanceOf/toThrow(msg?)\`, \`.not\`, \`await expect(promise).rejects.toThrow()\`, \`await sleep(ms)\`, \`mockFn(impl?)\` (ma \`.calls\` — tablica tablic argumentów, \`.contexts\` — wartości this).
  3–6 testów, deterministyczne, całość < 2 s (timery max ~100 ms). Bez DOM, bez sieci, bez import.
- "solution": pełne wzorcowe rozwiązanie przechodzące testy.
- "fileName": np. "debounce.${lang === 'typescript' ? 'ts' : 'js'}".`
  }
  return `Zadania "code" w ${lang} NIE są uruchamiane automatycznie — sprawdza je model. W "tests" opisz 3–5 przypadków testowych jako listę Markdown (wejście → oczekiwany wynik). "starterCode": sygnatura + TODO, bez rozwiązania. "solution": wzorcowe rozwiązanie. "fileName" z właściwym rozszerzeniem. "files", "testFiles", "solutionFiles": [], "testCommand": "".`
}

export function lessonTask({ profile, plan, moduleIndex, lessonIndex, weakSpots, runtime }) {
  const mod = plan.modules[moduleIndex]
  const lesson = mod.lessons[lessonIndex]
  const lang = plan.language || 'javascript'
  const earlier = plan.modules
    .slice(0, moduleIndex + 1)
    .flatMap((m, mi) => m.lessons.filter((_, li) => mi < moduleIndex || li < lessonIndex).map((l) => l.title))
  return {
    schema: lessonSchema,
    prompt: `Przygotuj jedną lekcję w stylu Duolingo.

## Uczeń
${profile.description}
Poziom: ${plan.level} — ${plan.levelSummary}
Czas dziennie: ${profile.minutesPerDay} min · Styl: ${STYLE_LABEL[profile.style] || STYLE_LABEL.balanced}
Aktualne słabe punkty: ${(weakSpots || []).join(', ') || 'brak danych'}

## Plan: ${plan.title} (język: ${lang})
Moduł ${moduleIndex + 1}: ${mod.title} — ${mod.description}
Lekcja ${lessonIndex + 1}/${mod.lessons.length}: **${lesson.title}** (rodzaj: ${lesson.kind})
Fokus: ${lesson.focus}
Wcześniejsze lekcje (nie powtarzaj ich treści): ${earlier.slice(-12).join('; ') || 'brak'}

## Skład lekcji
${KIND_MIX[lesson.kind] || KIND_MIX.mixed} — dokładnie w tej kolejności. Jeśli to pasuje do tematu, wpleć słabe punkty.

## Dydaktyka (ważne)
- Najpierw ucz, potem odpytuj. Poza rozgrzewką i sprawdzianem NIE pytaj o nic, czego karta "learn" (albo wcześniejsze lekcje) nie wyjaśniła.
- Rozgrzewka ("warmup": true) to jedno krótkie "choice" PRZED kartą wiedzy — intuicyjne zgadywanie, które budzi ciekawość; błąd nie jest karany. Karta "learn" zaraz po niej ma wyjaśnić, dlaczego jest tak, a nie inaczej. Wszystkie inne ćwiczenia mają "warmup": false.
- Ćwiczenia "choice" po karcie to warianty jej przykładu — każdy o krok trudniejszy.
- "open" stoi na końcu jako "Wyjaśnij własnymi słowami…" — sprawdza zrozumienie po nauce.

## Format ćwiczeń (wszystkie pola są wymagane; nieużywane = "" / [] / 0 / false)
- "learn" (karta wiedzy) — KRÓTKA, mieści się na jednym ekranie; jedno pojęcie na kartę (dwa pojęcia = dwie karty): "title" = nazwa pojęcia; "prompt" = wyjaśnienie mechanizmu, max 4 zdania / ~70 słów (Markdown, konkretnie, może być 1 analogia); "code" = minimalny przykład, max 8 linii, z krótkimi komentarzami \`// → wynik\` (max 25 znaków komentarza); "codeLanguage"; "explanation" = typowa pułapka w 1–2 zdaniach (bez prefiksu "Pułapka:"); "keyPoints" = 2–3 krótkie zasady (max 12 słów każda).
- Treść "prompt" rozgrzewki nie zawiera słowa "rozgrzewka" (aplikacja dodaje etykietę sama).
- "open": "prompt" = np. "Wyjaśnij własnymi słowami, …"; "referenceAnswer" = wzorcowa odpowiedź (Markdown, zwięzła); "keyPoints" = 3–5 elementów, które musi zawierać dobra odpowiedź; opcjonalnie "code" z fragmentem, którego dotyczy pytanie.
- "choice": "prompt" = pytanie (np. "Co wypisze ten kod?"); "code" = fragment kodu (lub ""); "codeLanguage"; "options" = 3–4 odpowiedzi (przy output: dokładne wyjście, np. "A D C B", tylko jedna poprawna, dystraktory oparte na typowych błędach); "correctIndex" (od 0); "explanation" = dlaczego (Markdown, 2–4 zdania).
- "code": "title" = np. "Zaimplementuj debounce(fn, wait)"; "prompt" = opis zadania; "requirements" = 3–5 punktów; "example" = krótki przykład użycia; "codeLanguage"; "fileName"; "starterCode"; "tests"; "solution".
${codeRules(lang, runtime)}
${runtime === 'docker' ? '' : '- "files", "testFiles", "solutionFiles": [], "testCommand": "" (nieużywane).'}

## Fiszki
"flashcards": 2–4 fiszki utrwalające najważniejsze pojęcia lekcji ("front" = pytanie, może zawierać blok kodu; "back" = zwięzła odpowiedź).`,
  }
}

// ---------------------------------------------------------------- naprawa testów

const fixTestsSchema = obj({ tests: str, solution: str, starterCode: str, note: str })

function fmtRun(run) {
  if (!run) return '(nie uruchomiono)'
  if (run.compileError) return `Błąd uruchomienia: ${run.compileError}`
  return run.results.map((r) => `${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.ok ? '' : ` — ${r.error}`}`).join('\n') || '(brak testów)'
}

const fileArr = arr(obj({ path: str, content: str }))
const fixSandboxSchema = obj({ files: fileArr, testFiles: fileArr, solutionFiles: fileArr, testCommand: str, note: str })

function fmtFiles(list) {
  return (list || []).map((f) => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``).join('\n\n') || '(brak)'
}

export function fixTestsTask({ exercise, language, solutionRun, starterRun, runtime }) {
  const lang = language || exercise.codeLanguage || 'javascript'
  if (runtime === 'docker') {
    return {
      schema: fixSandboxSchema,
      prompt: `Automatyczna weryfikacja zadania (uruchomionego naprawdę w kontenerze Docker) wykryła problem. Wzorcowe rozwiązanie MUSI przechodzić wszystkie testy, a pliki startowe MUSZĄ oblewać co najmniej jeden test.

## Zadanie: ${exercise.title}
${exercise.prompt}

## testCommand
\`${exercise.testCommand}\`

## files (start)
${fmtFiles(exercise.files)}

## solutionFiles
${fmtFiles(exercise.solutionFiles)}

## testFiles
${fmtFiles(exercise.testFiles)}

## Wynik: solutionFiles + testFiles
${fmtRun(solutionRun)}

## Wynik: files + testFiles
${fmtRun(starterRun)}

## Co zrobić
Ustal przyczynę (błąd kompilacji, zła ścieżka/komenda, zła oczekiwana wartość, harness nie wypisuje PASS/FAIL, brak biblioteki — pamiętaj: brak sieci) i popraw. Zwróć pełne "files", "testFiles", "solutionFiles", "testCommand" oraz w "note" jedno zdanie, co poprawiłeś.

${dockerRules(lang)}`,
    }
  }
  return {
    schema: fixTestsSchema,
    prompt: `Automatyczna weryfikacja zadania z kodem wykryła problem. Wzorcowe rozwiązanie MUSI przechodzić wszystkie testy, a szablon startowy MUSI oblewać co najmniej jeden test (inaczej testy niczego nie sprawdzają).

## Zadanie: ${exercise.title}
${exercise.prompt}
Wymagania:
${(exercise.requirements || []).map((r) => `- ${r}`).join('\n')}

## starterCode
\`\`\`${lang}
${exercise.starterCode}
\`\`\`

## solution
\`\`\`${lang}
${exercise.solution}
\`\`\`

## tests
\`\`\`js
${exercise.tests}
\`\`\`

## Wynik: solution
${fmtRun(solutionRun)}

## Wynik: starterCode
${fmtRun(starterRun)}

## Co zrobić
Ustal, czy błąd jest w testach (zła oczekiwana wartość, niedeterminizm, za krótki timer, użycie niedostępnego API), czy w rozwiązaniu, i popraw. Zachowaj sens zadania i nazwy z szablonu. Zwróć pełne, poprawione "tests", "solution" i "starterCode" (bez zmian, jeśli były dobre) oraz w "note" jedno zdanie, co poprawiłeś.

${codeRules(lang)}`,
  }
}

// ---------------------------------------------------------------- ocena odpowiedzi otwartej

const gradeSchema = obj({
  score: int,
  verdict: { type: 'string', enum: ['correct', 'almost', 'wrong'] },
  headline: str,
  points: arr(obj({ kind: { type: 'string', enum: ['good', 'bad', 'tip'] }, text: str })),
  modelAnswer: str,
  weakSpot: str,
  flashcard: obj({ front: str, back: str }),
})

export function gradeOpenTask({ exercise, answer, level }) {
  return {
    schema: gradeSchema,
    prompt: `Oceń odpowiedź ucznia (poziom: ${level || 'senior'}) na pytanie otwarte. Bądź rzetelny i wymagający jak na rozmowie rekrutacyjnej, ale sprawiedliwy — nie karz za styl, karz za błędy merytoryczne i braki.

## Pytanie
${exercise.prompt}
${exercise.code ? `\n\`\`\`${exercise.codeLanguage || ''}\n${exercise.code}\n\`\`\`\n` : ''}
## Wzorcowa odpowiedź
${exercise.referenceAnswer}

## Kluczowe elementy
${(exercise.keyPoints || []).map((k) => `- ${k}`).join('\n')}

## Odpowiedź ucznia
${answer || '(brak odpowiedzi)'}

## Format
- "score": 0–10. "verdict": "correct" (8–10), "almost" (5–7), "wrong" (0–4).
- "headline": 1 krótkie zdanie podsumowania dla stopki (np. "Dodałem „TDZ” do twoich fiszek.").
- "points": 2–4 punkty: "good" = co jest dobrze, "bad" = błąd/brak (konkretnie, z poprawką), "tip" = doprecyzowanie.
- "modelAnswer": zwięzła wzorcowa odpowiedź w Markdown.
- "weakSpot": jeśli jest istotna luka — krótkie hasło (1–3 słowa), inaczej "".
- "flashcard": jeśli verdict != "correct" — fiszka utrwalająca brakujący element; inaczej oba pola "".`,
  }
}

// ---------------------------------------------------------------- review kodu

const reviewSchema = obj({
  passed: bool,
  score: int,
  headline: str,
  summary: str,
  issues: arr(
    obj({
      file: str,
      line: int,
      severity: { type: 'string', enum: ['error', 'warning', 'info'] },
      message: str,
      replacement: str,
    }),
  ),
  weakSpot: str,
  flashcard: obj({ front: str, back: str }),
})

export function reviewCodeTask({ exercise, code, files, testResults, level }) {
  const num = (src) =>
    String(src || '')
      .split('\n')
      .map((l, i) => `${String(i + 1).padStart(3, ' ')} | ${l}`)
      .join('\n')
  const numbered = files?.length
    ? files.map((f) => `=== ${f.path} ===\n${num(f.content)}`).join('\n\n')
    : num(code)
  const testsText = files?.length ? fmtFiles(exercise.testFiles) : exercise.tests
  const tr = testResults
    ? testResults.compileError
      ? `Błąd uruchomienia: ${testResults.compileError}`
      : testResults.results.map((r) => `${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.ok ? '' : ` — ${r.error}`}`).join('\n')
    : 'Testy nie były uruchamiane automatycznie — oceń poprawność samodzielnie względem opisanych przypadków.'
  return {
    schema: reviewSchema,
    prompt: `Zrób code review rozwiązania ucznia (poziom: ${level || 'senior'}) jak doświadczony reviewer.

## Zadanie: ${exercise.title}
${exercise.prompt}

Wymagania:
${(exercise.requirements || []).map((r) => `- ${r}`).join('\n')}

Testy:
${testsText}

## Wyniki testów
${tr}

## Kod ucznia (z numerami linii)
\`\`\`
${numbered}
\`\`\`

## Format
- "passed": true tylko gdy rozwiązanie spełnia wymagania (jeśli testy były uruchomione i któryś FAIL → false).
- "score": 0–10.
- "headline": 1 krótkie zdanie do stopki.
- "summary": 2–4 zdania oceny (Markdown).
- NIE podawaj pełnego rozwiązania (aplikacja pokazuje je osobno) — naprowadzaj: wskaż błąd, mechanizm i kierunek poprawki. Jeśli kod to prawie niezmieniony szablon, daj 1–2 wskazówki na start zamiast listy wszystkich braków.
- "issues": 0–5 uwag przypiętych do konkretnych linii (numer z listingu; "file" = ścieżka pliku z nagłówka "=== … ===", przy jednym pliku ""). "message": po polsku, konkretnie, w tonie "tu gubisz this — …". "replacement": jeśli poprawka mieści się w tej jednej linii — pełna nowa treść tej linii z zachowanym wcięciem; inaczej "".
- "weakSpot": krótkie hasło luki albo "".
- "flashcard": jeśli passed=false — fiszka z kluczową lekcją z tego błędu; inaczej oba pola "".`,
  }
}

// ---------------------------------------------------------------- wyjaśnienia / czat

export function explainTask({ exercise, chosenIndex }) {
  return {
    prompt: `Uczeń odpowiedział błędnie. Wyjaśnij krok po kroku, dlaczego poprawna odpowiedź jest poprawna, a wybrana — nie. Jeśli to pytanie o wynik kodu, prześledź wykonanie linia po linii (stos wywołań, kolejki, wartości zmiennych).

## Pytanie
${exercise.prompt}
${exercise.code ? `\`\`\`${exercise.codeLanguage || ''}\n${exercise.code}\n\`\`\`` : ''}

Opcje:
${exercise.options.map((o, i) => `${i + 1}. ${o}`).join('\n')}

Poprawna: ${exercise.correctIndex + 1}. Wybór ucznia: ${chosenIndex + 1}.`,
  }
}

const MEM_KINDS = ['function', 'string', 'number', 'boolean', 'object', 'undefined', 'uninitialized', 'other']

const traceSchema = obj({
  headline: str,
  mistake: str,
  takeaway: str,
  steps: arr(
    obj({
      phase: str,
      line: int,
      title: str,
      say: str,
      note: str,
      skipped: bool,
      memory: arr(obj({ name: str, value: str, kind: { type: 'string', enum: MEM_KINDS }, changed: bool })),
      output: arr(str),
    }),
  ),
})

export function traceTask({ exercise, chosenIndex }) {
  const numbered = String(exercise.code || '')
    .split('\n')
    .map((l, i) => `${String(i + 1).padStart(3, ' ')} | ${l}`)
    .join('\n')
  const correct = chosenIndex === exercise.correctIndex
  return {
    schema: traceSchema,
    prompt: `Przygotuj interaktywne prześledzenie wykonania kodu krok po kroku — jak debugger z tutorem, który idzie po liniach. Uczeń będzie klikał "dalej", a aplikacja podświetli wskazaną linię, pokaże stan pamięci i konsolę.

## Pytanie
${exercise.prompt}

## Kod (numery linii są ważne)
\`\`\`
${numbered}
\`\`\`

Opcje:
${exercise.options.map((o, i) => `${i + 1}. ${o}`).join('\n')}
Poprawna: ${exercise.correctIndex + 1}. Wybór ucznia: ${chosenIndex == null ? 'brak' : chosenIndex + 1}${correct ? ' (poprawny)' : ' (błędny)'}.

## Zasady
- 4–10 kroków ("steps") w kolejności, w jakiej silnik faktycznie przetwarza kod. Jeśli są fazy (np. creation → execution w hoistingu, synchroniczny kod → mikrozadania → makrozadania w event loopie), oznacz je w "phase" krótką etykietą WIELKIMI LITERAMI, np. "FAZA 1 · CREATION", "FAZA 2 · EXECUTION", "MIKROZADANIA"; inaczej "".
- "line": numer linii z listingu, której dotyczy krok (1-based).
- "title": max 6 słów, np. "typeof foo → \\"function\\"". W kroku, w którym uczeń popełnił błąd, zacznij od "Tu był haczyk:".
- "say": 1–2 zdania, mówisz do ucznia jak tutor ("Teraz…", "Zwróć uwagę…"). Odwołaj się do jego błędnego założenia w odpowiednim kroku.
- "note": krótki komentarz doklejany na końcu tej linii, max 40 znaków (np. "foo = ƒ foo()", "→ kolejka mikrozadań"), albo "".
- "skipped": true, jeśli w tym kroku linia jest pomijana / nic nie robi (zostanie przekreślona).
- "memory": PEŁNY stan istotnych zmiennych PO tym kroku (max 6), "value" tak jak wypisałby je console (funkcja jako "ƒ foo()", string w apostrofach); "kind" = typ; "uninitialized" dla TDZ; "changed": true, jeśli zmieniła się w tym kroku. Dla event loopa możesz dodać pseudo-wpisy jak "microtasks" / "macrotasks" (kind "other", value np. "[log C]").
- "output": PEŁNA zawartość konsoli PO tym kroku (narastająco), dokładnie tak jak zostałaby wypisana.
- Ostatni krok kończy się kompletnym outputem zgodnym z poprawną odpowiedzią.
- "headline": 1 krótkie zdanie (max 120 znaków) — sedno, np. "Pierwszy typeof widzi funkcję, bo 'bar' przypisuje się dopiero w linii 2."
- "mistake": 1–2 zdania: ${correct ? 'co było kluczowe, żeby odpowiedzieć poprawnie' : 'gdzie dokładnie rozjechało się rozumowanie ucznia'}.
- "takeaway": jedna zasada do zapamiętania (1 zdanie).`,
  }
}

export function chatTask({ context, history, question }) {
  const conv = (history || []).map((m) => `**${m.role === 'user' ? 'Uczeń' : 'DevLingo'}:** ${m.content}`).join('\n\n')
  return {
    prompt: `Uczeń jest w trakcie ćwiczenia i dopytuje. Odpowiedz na jego pytanie w kontekście ćwiczenia.

## Kontekst ćwiczenia
${context}

${conv ? `## Dotychczasowa rozmowa\n${conv}\n` : ''}
## Pytanie ucznia
${question}`,
  }
}

export function pingTask() {
  return { schema: obj({ ok: bool, message: str }), prompt: 'Test połączenia. Zwróć ok=true i krótkie powitanie po polsku w "message".' }
}
