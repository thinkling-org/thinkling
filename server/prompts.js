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

const LANGUAGES = [
  'javascript', 'typescript', 'python', 'go', 'rust', 'java', 'csharp', 'cpp',
  'php', 'ruby', 'kotlin', 'swift', 'sql', 'other',
]
const LESSON_KINDS = ['theory', 'output', 'code', 'mixed', 'test']

export const SYSTEM_JSON = `Jesteś DevLingo — konkretnym tutorem programowania. Dopasowujesz poziom wyjaśnień do konkretnego ucznia i pojęcia.
Tworzysz materiały po polsku (terminy techniczne mogą zostać po angielsku). Piszesz zwięźle, technicznie, bez lania wody i bez emoji.
Treści tekstowe formatujesz w Markdown (inline \`kod\`, bloki \`\`\`lang). Nie używasz narzędzi.
Zwracasz wyłącznie dane zgodne z podanym schematem JSON.`

export const SYSTEM_CHAT = `Jesteś DevLingo — tutorem programowania. Dopasowujesz wyjaśnienia do wiedzy ucznia o omawianym pojęciu.
Odpowiadasz po polsku, zwięźle i technicznie, w Markdown (bloki kodu z językiem). Bez emoji, bez wstępów typu "Świetne pytanie".
Nie używasz narzędzi.`

export const SYSTEM_GRADE = `Jesteś DevLingo — tutorem programowania. Oceniasz zrozumienie po lekcji i pomagasz uczniowi zrobić kolejny krok.
Odpowiadasz po polsku, zwięźle, w Markdown. Komentarze opierasz na tym, co uczeń rzeczywiście napisał.
Nie używasz narzędzi. Zwracasz wyłącznie dane zgodne z podanym schematem JSON.`

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
- "weakSpots": do 6 krótkich haseł o lukach zgłoszonych przez ucznia lub wynikających z jego opisu. Przy braku podstaw zwróć [].
- 4–8 modułów, każdy 5–8 lekcji. Moduły ułożone od fundamentów do zaawansowanych. "week" = numer tygodnia (od 1).
- "durationWeeks" realne dla zadeklarowanego czasu dziennie.
- Każda lekcja ma "kind":
  - "theory": nowe pojęcie na przykładzie, próba z podpowiedzią i sprawdzenie rozumienia,
  - "output": pokaz mechanizmu, próba z podpowiedzią i przewidywanie zachowania podobnego kodu,
  - "code": technika na przykładzie, próba z podpowiedzią i małe zadanie w edytorze,
  - "mixed": pojęcie z przykładem, próba z podpowiedzią i zastosowanie,
  - "test": sprawdzian modułu — zawsze OSTATNIA lekcja każdego modułu.
- "focus": 1 zdanie o konkretnej umiejętności, którą uczeń zdobędzie lub utrwali.
- Tytuły lekcji krótkie (2–5 słów), konkretne.
- "language": główny język programowania planu (do edytora kodu).
- Staż i poziom określają tempo, ale znajomość pojęć wyprowadzaj z opisu ucznia. Wykorzystaj znane mu języki, narzędzia i sytuacje zawodowe jako kontekst przykładów.
- Jeśli celem jest rozmowa rekrutacyjna, najpierw zaplanuj naukę i praktykę, a symulację rozmowy zostaw na sprawdzian. Algorytmy dodawaj wtedy, gdy wynikają z opisu celu.`
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

const num = { type: 'number' }
const namedValue = obj({ name: str, value: str })
const codeVariantSchema = obj({ label: str, code: str, outcome: str, steps: arr(obj({ line: int, say: str })) })
const visualizationSchema = {
  anyOf: [
    { type: 'null' },
    obj({ type: { type: 'string', enum: ['code-comparison'] }, variants: arr(codeVariantSchema) }),
    obj({
      type: { type: 'string', enum: ['linear-regression'] },
      instruction: str,
      xLabel: str,
      yLabel: str,
      points: arr(obj({ x: { type: 'number' }, y: { type: 'number' } })),
    }),
    obj({
      type: { type: 'string', enum: ['code-definitions'] },
      instruction: str,
      code: str,
      terms: arr(obj({ token: str, title: str, kind: str, definition: str, example: str })),
    }),
    obj({
      type: { type: 'string', enum: ['step-trace'] },
      instruction: str,
      code: str,
      steps: arr(obj({ line: int, say: str, variables: arr(namedValue), output: str })),
    }),
    obj({
      type: { type: 'string', enum: ['state-inspector'] },
      instruction: str,
      code: str,
      label: str,
      layout: { type: 'string', enum: ['stack', 'queue', 'list'] },
      steps: arr(obj({ line: int, say: str, items: arr(obj({ label: str, status: str, details: arr(namedValue) })) })),
    }),
    obj({
      type: { type: 'string', enum: ['value-chart'] },
      instruction: str,
      xLabel: str,
      yLabel: str,
      xs: arr(num),
      series: arr(obj({ label: str, values: arr(num) })),
      yMax: num,
      notes: arr(obj({ from: num, say: str })),
    }),
    obj({
      type: { type: 'string', enum: ['logic-circuit'] },
      instruction: str,
      inputs: arr(obj({ id: str, label: str, on: bool })),
      outputs: arr(obj({ label: str, expression: str })),
      notes: arr(obj({ pattern: str, say: str })),
    }),
    obj({
      type: { type: 'string', enum: ['step-ordering'] },
      instruction: str,
      steps: arr(obj({ text: str, indent: int })),
      success: str,
      hint: str,
    }),
    obj({
      type: { type: 'string', enum: ['diagnosis'] },
      instruction: str,
      symptom: str,
      checks: arr(obj({ name: str, detail: str, action: str, result: str, ok: bool })),
      options: arr(obj({ text: str, correct: bool, why: str })),
    }),
  ],
}

const exerciseSchema = obj({
  type: { type: 'string', enum: ['learn', 'choice', 'code', 'open'] },
  stage: { type: 'string', enum: ['learn', 'practice', 'check', 'challenge'] },
  prompt: str,
  code: str,
  codeLanguage: str,
  options: arr(str),
  correctIndex: int,
  explanation: str,
  referenceAnswer: str,
  keyPoints: arr(str),
  hint: str,
  prerequisites: arr(obj({ term: str, explanation: str })),
  visualization: visualizationSchema,
  title: str,
  requirements: arr(str),
  toolbox: arr(obj({ name: str, description: str })),
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
  intro: obj({
    summary: str,
    outcome: str,
    outcomes: arr(str),
    relevance: str,
    focus: str,
    hero: arr(obj({ text: str, label: str, kind: { type: 'string', enum: ['input', 'operation', 'value', 'result', 'symbol'] } })),
  }),
  exercises: arr(exerciseSchema),
  flashcards: arr(obj({ front: str, back: str })),
})

const CHECK_BY_KIND = {
  theory: 'jedno "open" albo "choice" sprawdzające zrozumienie mechanizmu',
  output: 'jedno "choice" z przewidywaniem zachowania podobnego kodu',
  code: 'jedno krótkie "code" z zastosowaniem poznanej techniki',
  mixed: 'jedno krótkie "code" albo "open" z zastosowaniem poznanej techniki',
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
    .flatMap((m, mi) => m.lessons
      .filter((l, li) => l.status === 'done' && (mi < moduleIndex || li < lessonIndex))
      .map((l) => l.focus || l.title))
  const sequence = lesson.kind === 'test'
    ? 'Po wprowadzeniu daj 4–6 ćwiczeń z ukończonych lekcji tego modułu, każde ze stage "check". Dobierz mieszankę "choice", "code" i "open" do materiału i celu ucznia.'
    : `Po wprowadzeniu daj dokładnie w tej kolejności:
1. Jedną lub dwie karty "learn" ze stage "learn" i konkretnym rozwiązanym przykładem.
2. Jedno "choice" ze stage "practice". Uczeń stosuje pokazany mechanizm w podobnym przypadku. Dodaj podpowiedź i pełne wyjaśnienie. Aplikacja pozwala obejrzeć rozwiązanie i nie wystawia oceny.
3. Stage "check": ${CHECK_BY_KIND[lesson.kind] || CHECK_BY_KIND.mixed}.
4. Opcjonalnie jedno "choice" ze stage "challenge" na samym końcu, jeśli pasuje do celu ucznia. Może być pytaniem rekrutacyjnym, ale ma opierać się na wyjaśnionych mechanizmach.`
  return {
    schema: lessonSchema,
    prompt: `Przygotuj jedną lekcję w stylu Duolingo.

## Uczeń
${profile.description}
Poziom: ${plan.level} — ${plan.levelSummary}
Czas dziennie: ${profile.minutesPerDay} min · Styl: ${STYLE_LABEL[profile.style] || STYLE_LABEL.balanced}
Pojęcia do powtórki i możliwe luki: ${(weakSpots || []).join(', ') || 'brak danych'}

## Plan: ${plan.title} (język: ${lang})
Cel ucznia: ${plan.goal || 'zobacz opis ucznia'}
Moduł ${moduleIndex + 1}: ${mod.title} — ${mod.description}
Lekcja ${lessonIndex + 1}/${mod.lessons.length}: **${lesson.title}** (rodzaj: ${lesson.kind})
Fokus: ${lesson.focus}
Tematy z ukończonych wcześniejszych lekcji: ${earlier.slice(-12).join('; ') || 'brak'}

## Początek lekcji
Wypełnij obiekt "intro". To ekran powitalny lekcji, więc pisz krótko i konkretnie:
- "summary": 2–3 zdania wprowadzenia. Nazwij problem z praktyki i daj prostą analogię albo obserwację (np. „Dla Pythona "45000" to tylko znaki, tak jak "Toyota"”). Bez zdradzania całego rozwiązania.
- "outcome": jedno zdanie: co konkretnie uczeń będzie umiał zrobić po lekcji. Dla sprawdzianu: co przećwiczy.
- "outcomes": dokładnie 3 krótkie umiejętności (max ~9 słów każda), od rozpoznania przez zastosowanie do wyniku, np. „Zamienisz napis na liczbę i policzysz cenę z transportem”.
- "relevance": przy jakim realnym zadaniu to się przydaje. Odwołaj się do celu i deklarowanego doświadczenia ucznia.
- "focus": na co patrzeć w przykładzie lub ćwiczeniach. Wskaż konkretną decyzję lub element kodu, bez zdradzania odpowiedzi.
- "hero": mały schemat przemiany, który pokazuje sedno lekcji na jednym przykładzie: 3–6 elementów czytanych od lewej do prawej. "kind": "input" (dane wejściowe), "operation" (funkcja, operator albo mechanizm, np. "int()", "await", "JOIN"), "value" (wynik pośredni), "result" (efekt końcowy), "symbol" (krótki łącznik bez ramki, np. "+ 1200 ="). "text" = dosłowna wartość lub kod (max ~14 znaków), "label" = 1–3 słowa opisu pod spodem (np. "napis", "zamiana", "da się policzyć"; dla "symbol" ""). Przykład: "45000" (input, napis) → int() (operation, zamiana) → 45000 (value, liczba) → + 1200 = (symbol) → 46200 (result, da się policzyć). Jeśli temat nie ma sensownej przemiany, zwróć [].

## Kolejność
${sequence}

## Dydaktyka (ważne)
- Zacznij od problemu z praktyki. Jeżeli opis ucznia wymienia znany mu język, narzędzie lub rodzaj pracy, użyj tego w przykładzie albo analogii. Nie przypisuj uczniowi doświadczeń, których nie podał.
- Poziom Senior/Lead sam w sobie nie potwierdza znajomości wzorców, bibliotek ani API. Wyjaśnij pojęcie potrzebne do zrozumienia przykładu, kiedy używasz go po raz pierwszy. Np. pokaż tworzenie obiektu przez funkcję przed użyciem terminu "fabryka", a przy "bind" pokaż, co zwraca i dlaczego zmienia się zachowanie wywołania.
- Jeżeli karta opiera się na pojęciu, które może wymagać powtórki, dodaj je do "prerequisites": "term" to jego krótka nazwa, "explanation" to definicja własnymi słowami z prostszym konkretnym przykładem (Markdown). W treści karty wyjaśnij niezbędne minimum niezależnie od tego pola.
- "practice" oraz pierwsze sprawdzenie ćwiczą tylko pokazany mechanizm. Pierwsze zastosowanie ma być wprost analogiczne do przykładu. Pułapki i niuanse odłóż do opcjonalnego wyzwania lub osobnego sprawdzianu po nauce.

## Format ćwiczeń (wszystkie pola są wymagane; nieużywane = "" / [] / 0 / null)
- "learn" (karta wiedzy): "title" = jedno pojęcie; "prompt" = problem z praktyki, wyjaśnienie mechanizmu i na co patrzeć w przykładzie (max 4 zdania / ~70 słów); "code" = krótki rozwiązany przykład, max 8 linii; "codeLanguage"; "explanation" = dlaczego rozwiązanie działa, 1–2 zdania; "keyPoints" = 2–3 krótkie zasady.
- "visualization" wybieraj tylko w kartach "learn", jeśli uczeń może dzięki niej zaobserwować uczony mechanizm. W pozostałych ćwiczeniach i przy braku pasującego komponentu zwróć null.
  - "code-comparison": gdy zmiana jednej decyzji w kodzie tłumaczy pojęcie, daj dokładnie dwa "variants" z tym samym kontekstem. Dla każdego podaj krótki "label" (np. "Bez nawiasów"), "code", wynik w jednym zdaniu w "outcome" i 2–4 "steps". Każdy krok ma numer linii od 1 ("line") i jedno krótkie zdanie ("say") o wykonywanej operacji lub wyniku pośrednim. Możesz użyć tego samego numeru linii w kilku krokach. Ostatni krok pokazuje wynik. Treść "prompt" karty ma wprowadzić przykład w maksymalnie dwóch zdaniach. Dodatkowe wyjaśnienia i punkty do zapamiętania mają uzupełniać kroki. Ustaw główne "code" na "".
  - "linear-regression": użyj przy nauce dopasowania prostej, reszt lub średniego kwadratu błędu. W "points" podaj 5–12 par liczbowych z co najmniej dwiema różnymi wartościami x, sensownym trendem i widocznym rozrzutem. Dopasuj przykład do celu ucznia i podaj jednostki w "xLabel" oraz "yLabel", jeśli występują. W "instruction" poproś ucznia o dopasowanie prostej suwakiem i zwrócenie uwagi na zmianę pionowych odcinków. Wynik dopasowania, suwaki i błąd wylicza aplikacja. Wyjaśnij, co oznaczają kreski i czemu mniejszy średni kwadrat błędu oznacza lepsze dopasowanie. Jeżeli dodajesz przykład w kodzie, użyj dokładnie tych samych punktów.
  - "code-definitions": gdy przykład używa kilku funkcji, słów kluczowych, pól (np. nagłówka pakietu) lub symboli, których uczeń może nie znać. "code" = krótki przykład (max 8 linii). W "terms" podaj 2–5 pozycji: "token" = dokładny fragment występujący w "code" (np. "filter", "=>", "TTL"), "title" (np. "Array.filter(fn)"), "kind" = rodzaj (np. "metoda tablicy", "pole nagłówka"), "definition" = 1–2 zdania o tym, co robi i co zwraca, "example" = osobny mini-przykład (1–3 linie) albo "". Ustaw główne "code" na "".
  - "step-trace": gdy liczy się kolejność wykonania (pętla, warunek, kolejne przypisania, przejście pakietu przez kolejne urządzenia zapisane jako kroki konfiguracji). 4–10 "steps", każdy zmienia jedną rzecz: "line" od 1, "say" = co się dzieje i dlaczego, "variables" = pełny stan śledzonych wartości po kroku [{name, value}] (value jako tekst; 1–4 zmienne, te same nazwy w każdym kroku, gdy już istnieją), "output" = całe dotychczasowe wyjście programu albo "". Ustaw główne "code" na "".
  - "state-inspector": gdy uczeń ma zajrzeć do struktury, która rośnie i maleje: stos wywołań, kolejka, lista, tablica routingu, rejestry. "label" = nazwa struktury (np. "Stos wywołań"), "layout" = "stack" (ostatni element jest aktywny), "queue" albo "list". 3–8 "steps": "line" (0, gdy brak "code"), "say", "items" = pełna zawartość po kroku w kolejności od dołu stosu lub początku kolejki [{label, status, details}], gdzie "details" to pary [{name, value}] widoczne po kliknięciu elementu. "code" może być "" przy pojęciu bez kodu. Ustaw główne "code" na "".
  - "value-chart": gdy uczeń ma zobaczyć, jak wynik zmienia się wraz z jednym parametrem (złożoność algorytmów, wzrost, sygnał, statystyka). "xs" = 8–40 rosnących wartości parametru, "series" = 1–5 serii, każda z "values" o tej samej długości co "xs", policzonych dokładnie. "yMax" = górna granica osi (0 = automatycznie; ustaw, gdy jedna seria rośnie tak szybko, że spłaszczyłaby resztę). "notes" = 1–3 komentarze [{from, say}] pokazywane od danej wartości x. "instruction" mówi, co przesunąć i na co patrzeć.
  - "logic-circuit": przy bramkach logicznych, warunkach logicznych, połączeniu szeregowym i równoległym przełączników. "inputs" = 1–4 wejścia [{id, label, on}] (id: krótka nazwa, np. "A"), "outputs" = 1–4 wyjścia [{label, expression}], gdzie "expression" używa id wejść, nawiasów i operatorów AND, OR, XOR, NOT. "notes" = komentarze dla wybranych ustawień wejść [{pattern, say}], gdzie pattern to ciąg 0/1 w kolejności "inputs" (np. "10"). Tabelę prawdy liczy aplikacja.
  - "step-ordering": gdy uczeń ma sam ułożyć kroki algorytmu, procedury lub konfiguracji. "steps" = 3–7 kroków we WŁAŚCIWEJ kolejności (aplikacja je przetasuje), "indent" = poziom wcięcia 0–2, teksty krótkie i rozróżnialne. "success" = co uczeń ma zauważyć po ułożeniu, "hint" = podpowiedź po błędzie bez zdradzania kolejności.
  - "diagnosis": przy szukaniu przyczyny awarii (błąd w kodzie, niedostępny host, przerwany obwód). "symptom" = obserwowany objaw, "checks" = 3–6 pomiarów w kolejności drogi danych lub prądu [{name, detail, action, result, ok}], gdzie "action" to nazwa narzędzia lub czynności (np. "ping", "curl", "pomiar napięcia"), "result" to wynik, a "ok" mówi, czy wynik jest poprawny. "options" = 3–4 diagnozy, dokładnie jedna "correct": true, każda z "why" tłumaczącym, które pomiary ją potwierdzają lub wykluczają.
  Wybierz jedną pomoc, która najlepiej pokazuje mechanizm karty. Nie dodawaj pomocy na siłę.
- "practice": w "hint" wskaż, na który element przykładu spojrzeć albo co zrobić jako pierwszy krok. Podpowiedź nie zdradza poprawnej opcji. Po ćwiczeniu "explanation" tłumaczy rozwiązanie niezależnie od wyboru ucznia. Pole "hint" ustaw na "" w innych etapach.
- "open": zadaj jedno skupione pytanie o zrozumienie mechanizmu. Jeśli ma podpunkty, zapisz je wprost w "prompt". W "referenceAnswer" podaj zwięzły przykład poprawnej odpowiedzi. W "keyPoints" podaj po jednym kryterium na każdą niezależną rzecz, o którą pytasz, bez powtórzeń. Opcjonalnie dodaj "code" z fragmentem, którego dotyczy pytanie.
- "choice": "prompt" = pytanie (np. "Co wypisze ten kod?"); "code" = fragment kodu (lub ""); "codeLanguage"; "options" = 3–4 odpowiedzi (przy output: dokładne wyjście, np. "A D C B", tylko jedna poprawna, dystraktory oparte na typowych błędach); "correctIndex" (od 0); "explanation" = dlaczego (Markdown, 2–4 zdania).
- "code": "title" = np. "Zaimplementuj debounce(fn, wait)"; "prompt" = opis zadania; "requirements" = 3–5 punktów; "toolbox" = 2–5 funkcji, metod lub konstrukcji języka, które przydadzą się w rozwiązaniu [{name, description}], np. {"name": "int(x)", "description": "zamienia napis z cyframi na liczbę całkowitą"} albo {"name": "f\"...{x}...\"", "description": "f-string: wstawia wartość zmiennej do tekstu"}. Opis mówi, co robi, a nie gdzie go użyć; nie zdradzaj kolejności ani całego rozwiązania. W pozostałych typach ćwiczeń "toolbox" = []; Jeśli testy porównują dokładny tekst wyjścia, zapisz ten format w "requirements" w backtickach, znak w znak tak jak w testach (np. \`Cena z transportem: 12300 zł\`), i nie stawiaj kropki ani innego znaku zdania tuż za nim, żeby uczeń nie wziął go za część wyjścia; "example" = krótki przykład użycia; "codeLanguage"; "fileName"; "starterCode"; "tests"; "solution".
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
    prompt: `Oceń odpowiedź ucznia po lekcji. Poziom ucznia (${level || 'niepodany'}) pomaga dobrać język komentarza. Zastosuj tę samą skalę oceny na każdym poziomie.

## Pytanie
${exercise.prompt}
${exercise.code ? `\n\`\`\`${exercise.codeLanguage || ''}\n${exercise.code}\n\`\`\`\n` : ''}
## Przykład poprawnej odpowiedzi
${exercise.referenceAnswer || '(brak wzorca)'}

## Wskazówki do oceny
${(exercise.keyPoints || []).map((k) => `- ${k}`).join('\n') || '(oceń na podstawie pytania)'}

## Odpowiedź ucznia
${answer || '(brak odpowiedzi)'}

## Zasady oceny
- Wyodrębnij rzeczy, o które pytanie prosi wprost. Użyj wzorca i wskazówek jako pomocy. Kilka sformułowań tego samego mechanizmu to jedno kryterium. Dodatki ze wzorca spoza pytania są opcjonalne.
- Uznaj odpowiedź wyrażoną własnymi słowami, równoważny kod i sens, który jasno wynika z wypowiedzi. Jeśli uczeń wyjaśnił, że po skasowaniu własnego pola odczyt sięga do prototypu, zalicz ten mechanizm w całości. Powtórzenie nazwy operacji lub poprzedniej wartości pola nie daje osobnych punktów.
- Oceń każde wymaganie proporcjonalnie do jego znaczenia. Za poprawny pomysł na rozwiązanie przyznaj punkty także wtedy, gdy brakuje zapisu w składni języka. Jeśli pytanie wprost prosi o deklarację lub kod, odróżnij brak samej składni od pominięcia całego podpunktu.
- Oceniaj znaczenie, nie styl, długość, terminologię ani format. Odejmuj punkty za istotny błąd lub pominięcie wyraźnego wymagania. Jedna luka może obniżyć ocenę tylko raz. Słowa doprecyzowania oznacz jako "tip" i nie odejmuj za nie punktów.
- Skala: 9–10 za poprawne ujęcie wszystkich wymaganych elementów; 8 za trafne wyjaśnienie sedna z niewielkim brakiem, np. poprawną metodą bez dokładnej składni; 5–7 za częściowe zrozumienie z istotną luką lub błędem; 0–4, jeśli sedna brakuje lub rozumowanie jest w większości błędne. Przy trafnym wyjaśnieniu kilku głównych elementów i jednym pominiętym podpunkcie wybierz górną część zakresu 5–7, stosownie do jego wagi.

## Format
- "score": 0–10. "verdict": "correct" (8–10), "almost" (5–7), "wrong" (0–4).
- "headline": jedno krótkie zdanie o tym, co uczeń zrozumiał lub co warto poprawić.
- "points": 1–3 punkty, bez komentarzy na siłę. "good" = co uczeń wyjaśnił poprawnie, "bad" = konkretny błąd lub brak z poprawką, "tip" = opcjonalne doprecyzowanie. Każdy punkt omawia inny aspekt odpowiedzi. Nie oznaczaj tego samego aspektu jako "good" i "bad".
- "modelAnswer": zwięzła wzorcowa odpowiedź w Markdown.
- "weakSpot": istotny brak w zrozumieniu jako krótkie hasło (1–3 słowa), inaczej "".
- "flashcard": jeśli odpowiedź ujawnia konkretną lukę w zrozumieniu i "verdict" to "almost" lub "wrong", utwórz fiszkę o tej luce. W pozostałych przypadkach zwróć oba pola puste.`,
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
  const learning = exercise.type === 'learn'
  const context = learning
    ? `## Karta wiedzy: ${exercise.title}
${exercise.prompt}
${exercise.explanation || ''}
${(exercise.keyPoints || []).join('\n')}`
    : `## Pytanie
${exercise.prompt}`
  const options = learning ? '' : `Opcje:
${exercise.options.map((o, i) => `${i + 1}. ${o}`).join('\n')}
Poprawna: ${exercise.correctIndex + 1}. Wybór ucznia: ${chosenIndex == null ? 'brak' : chosenIndex + 1}${correct ? ' (poprawny)' : ' (błędny)'}.

`
  return {
    schema: traceSchema,
    prompt: `Przygotuj interaktywne prześledzenie wykonania kodu krok po kroku — jak debugger z tutorem, który idzie po liniach. Uczeń będzie klikał "dalej", a aplikacja podświetli wskazaną linię, pokaże stan pamięci i konsolę.

${context}

## Kod (numery linii są ważne)
\`\`\`
${numbered}
\`\`\`

${options}## Zasady
- 4–10 kroków ("steps") w kolejności, w jakiej silnik faktycznie przetwarza kod. Jeśli są fazy (np. creation → execution w hoistingu, synchroniczny kod → mikrozadania → makrozadania w event loopie), oznacz je w "phase" krótką etykietą WIELKIMI LITERAMI, np. "FAZA 1 · CREATION", "FAZA 2 · EXECUTION", "MIKROZADANIA"; inaczej "".
- "line": numer linii z listingu, której dotyczy krok (1-based).
- Gdy w jednej linii jest kilka działań istotnych dla tematu, pokaż je w osobnych krokach z tym samym numerem linii. Przy obliczeniach pokaż konkretne działanie i wartość pośrednią, a wyjście konsoli dodaj dopiero w kroku wypisywania.
- "title": max 6 słów, np. "Odczyt wartości foo". ${learning ? 'Nazwij wykonywaną operację.' : 'W kroku, w którym uczeń popełnił błąd, zacznij od "Tu był haczyk:".'}
- "say": 1–2 zdania, mówisz do ucznia jak tutor ("Teraz…", "Zwróć uwagę…"). ${learning ? 'Wyjaśnij, jak ten krok pokazuje pojęcie z karty i skąd bierze się każda ważna zmiana stanu. Uczeń nie odpowiadał na pytanie.' : 'Odwołaj się do jego błędnego założenia w odpowiednim kroku.'}
- "note": krótki komentarz doklejany na końcu tej linii, max 40 znaków (np. "foo = ƒ foo()", "→ kolejka mikrozadań"), albo "".
- "skipped": true, jeśli w tym kroku linia jest pomijana / nic nie robi (zostanie przekreślona).
- "memory": PEŁNY stan istotnych zmiennych PO tym kroku (max 6), "value" tak jak wypisałby je console (funkcja jako "ƒ foo()", string w apostrofach); "kind" = typ; "uninitialized" dla TDZ; "changed": true, jeśli zmieniła się w tym kroku. Dla event loopa możesz dodać pseudo-wpisy jak "microtasks" / "macrotasks" (kind "other", value np. "[log C]").
- "output": PEŁNA zawartość konsoli PO tym kroku (narastająco), dokładnie tak jak zostałaby wypisana.
- Ostatni krok kończy się kompletnym outputem zgodnym z ${learning ? 'rzeczywistym wykonaniem przykładu. Jeżeli kod nic nie wypisuje, pozostaw output pusty' : 'poprawną odpowiedzią'}.
- "headline": 1 krótkie zdanie (max 120 znaków) — sedno, np. "Pierwszy typeof widzi funkcję, bo 'bar' przypisuje się dopiero w linii 2."
- "mistake": 1–2 zdania: ${learning ? 'co w działaniu przykładu było kluczowe i jakiej typowej pomyłki pozwala uniknąć' : correct ? 'co było kluczowe, żeby odpowiedzieć poprawnie' : 'gdzie dokładnie rozjechało się rozumowanie ucznia'}.
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
