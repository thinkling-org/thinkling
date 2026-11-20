import { shallowRef } from 'vue'

export const activeTerm = shallowRef(null)

const terms = [
  ['TDZ', ['TDZ', 'temporal dead zone'], 'Okres od wejścia do zakresu do zainicjalizowania deklaracji let, const lub class. Próba odczytu wiązania w tym czasie powoduje ReferenceError.'],
  ['Hoisting', ['hoisting', 'hoistingu'], 'Silnik przygotowuje wiązania deklaracji przed wykonaniem kodu w danym zakresie. Na przykład var ma początkowo wartość undefined, a let i const pozostają w TDZ do inicjalizacji.'],
  ['Closure (domknięcie)', ['closure', 'closures', 'domknięcie', 'domknięcia'], 'Funkcja zachowuje dostęp do wiązań z zakresu, w którym powstała, także po zakończeniu tego zakresu. Przy wywołaniu odczytuje aktualną wartość przechwyconego wiązania.'],
  ['Zakres leksykalny', ['zakres leksykalny', 'lexical scope'], 'O dostępności nazw decyduje miejsce, w którym kod został zapisany. Funkcja może szukać nazw w swoim zakresie i w zakresach go otaczających.'],
  ['Przesłanianie', ['shadowing', 'przesłanianie'], 'Deklaracja w wewnętrznym zakresie może mieć tę samą nazwę co deklaracja zewnętrzna. Odwołanie w zakresie wewnętrznym wybiera bliższe wiązanie.'],
  ['Kontekst wykonania', ['execution context', 'kontekst wykonania', 'kontekstu wykonania'], 'Stan, którego silnik używa podczas wykonywania danego kodu. Obejmuje między innymi informacje potrzebne do rozwiązywania nazw i ustalenia wartości this.'],
  ['Event loop', ['event loop', 'pętla zdarzeń'], 'Mechanizm, który pozwala środowisku wykonywać kolejne zadania. Po zakończeniu zadania środowisko opróżnia kolejkę mikrozadań przed przejściem do następnego zadania.'],
  ['Mikrozadanie', ['microtask', 'microtasks', 'mikrozadanie', 'mikrozadania', 'mikrozadań'], 'Zadanie wykonywane podczas opróżniania kolejki mikrozadań. Do tej kolejki trafiają między innymi reakcje na rozstrzygnięcie Promise.'],
  ['Makrozadanie', ['macrotask', 'macrotasks', 'makrozadanie', 'makrozadania', 'makrozadań'], 'Potoczna nazwa zadania w pętli zdarzeń. Przykładem jest wywołanie funkcji przekazanej do setTimeout, kiedy środowisko wybierze to zadanie do wykonania.'],
  ['ReferenceError', ['ReferenceError'], 'Błąd oznaczający, że silnik nie może odczytać wskazanego wiązania, na przykład dla nieznanej nazwy lub nazwy znajdującej się jeszcze w TDZ.'],
  ['TypeError', ['TypeError'], 'Błąd oznaczający, że dana wartość nie obsługuje wykonywanej operacji, na przykład gdy próbujesz wywołać liczbę jak funkcję.'],
]

const definitions = new Map(terms.flatMap(([title, aliases, definition]) =>
  aliases.map((alias) => [alias.toLowerCase(), { title, definition }]),
))
const pythonFunctions = {
  print: 'Wypisuje podane wartości. Domyślnie oddziela je spacjami i kończy znakem nowej linii.',
  input: 'Czyta jedną linię wpisaną przez użytkownika i zwraca ją jako tekst.',
  len: 'Zwraca liczbę elementów, na przykład znaków w tekście albo elementów listy.',
  range: 'Tworzy zakres liczb całkowitych. Wartość końcowa jest wyłączona z zakresu.',
  int: 'Zamienia wartość na liczbę całkowitą. Przy konwersji liczby ułamkowej odcina część ułamkową.',
  float: 'Zamienia liczbę lub tekst na liczbę zmiennoprzecinkową.',
  str: 'Zwraca tekstową reprezentację przekazanej wartości.',
  bool: 'Sprawdza wartość w kontekście logicznym i zwraca True albo False.',
  type: 'Wywołane z jednym argumentem zwraca jego typ.',
  round: 'Zaokrągla liczbę. Opcjonalny drugi argument określa liczbę miejsc po przecinku.',
  abs: 'Zwraca wartość bezwzględną liczby. Dla liczby zespolonej zwraca jej moduł.',
  sum: 'Dodaje wartości z przekazanej kolekcji, na przykład liczby z listy.',
  min: 'Zwraca najmniejszą z wartości.',
  max: 'Zwraca największą z wartości.',
  list: 'Tworzy listę, na przykład z elementów zakresu albo napisu.',
  dict: 'Tworzy słownik przechowujący pary klucz i wartość.',
  set: 'Tworzy zbiór unikalnych elementów.',
  tuple: 'Tworzy krotkę, czyli uporządkowaną kolekcję, której elementów nie można podmieniać.',
  sorted: 'Zwraca nową, posortowaną listę elementów.',
  enumerate: 'Podczas iteracji zwraca pary zawierające numer i element. Numeracja domyślnie zaczyna się od zera.',
  zip: 'Podczas iteracji łączy elementy z tych samych pozycji w krotki. Domyślnie kończy na najkrótszym wejściu.',
  map: 'Podczas iteracji stosuje funkcję do kolejnych elementów i zwraca jej wyniki.',
  filter: 'Podczas iteracji przepuszcza elementy, dla których podana funkcja zwraca wartość prawdziwą.',
  any: 'Zwraca True, jeśli przynajmniej jeden element ma wartość prawdziwą.',
  all: 'Zwraca True, jeśli każdy element ma wartość prawdziwą. Dla pustego wejścia także zwraca True.',
}
const javascriptFunctions = {
  'console.log': 'Wypisuje podane wartości w konsoli. Przydaje się do podglądania danych podczas działania kodu.',
  parseInt: 'Czyta początek tekstu jako liczbę całkowitą. Drugi argument może wskazać podstawę systemu liczbowego.',
  parseFloat: 'Czyta początek tekstu jako liczbę, również z częścią ułamkową.',
  isNaN: 'Najpierw próbuje zamienić argument na liczbę, a potem sprawdza, czy wynikiem jest NaN.',
}
const codeDefinitions = new Map(
  Object.entries({ python: pythonFunctions, javascript: javascriptFunctions }).flatMap(([language, entries]) =>
    Object.entries(entries).map(([name, definition]) => [`${language}:${name}`, { title: `${name}()`, definition }]),
  ),
)
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const aliases = [...definitions.keys()].sort((a, b) => b.length - a.length).map(escape)
const pattern = new RegExp(`(?<![\\p{L}\\p{N}_$])(?:${aliases.join('|')})(?![\\p{L}\\p{N}_$])`, 'giu')

export const glossaryEntry = (term) => definitions.get(term) || codeDefinitions.get(term)

export function linkCodeTerms(html, language) {
  const scope = language === 'typescript' ? 'javascript' : language
  if (scope !== 'python' && scope !== 'javascript') return html

  return html.replace(
    /<span class="hljs-built_in">([a-zA-Z_][\w]*)<\/span>(?=\s*\()|<span class="hljs-variable language_">console<\/span>\.<span class="hljs-title function_">(log)<\/span>(?=\s*\()/g,
    (markup, builtin, method, offset) => {
      const key = `${scope}:${builtin || `console.${method}`}`
      if (!codeDefinitions.has(key) || /\.\s*$/.test(html.slice(0, offset))) return markup
      return `<button type="button" class="code-term" data-glossary-term="${key}" aria-expanded="false">${markup}</button>`
    },
  )
}

let codeCloseTimer

export function keepCodeDefinitionOpen() {
  clearTimeout(codeCloseTimer)
}

export function closeCodeDefinitionSoon(term) {
  keepCodeDefinitionOpen()
  codeCloseTimer = setTimeout(() => {
    if (activeTerm.value === term && document.activeElement !== term && !term.matches(':hover')) activeTerm.value = null
  }, 200)
}

export function linkGlossaryTerms(html) {
  const template = document.createElement('template')
  template.innerHTML = html
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT)
  const nodes = []
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.parentElement?.closest('pre, a, button, [contenteditable]')) nodes.push(node)
  }
  for (const node of nodes) {
    const code = node.parentElement?.closest('code')
    if (code && !definitions.has(code.textContent.trim().toLowerCase())) continue
    let end = 0
    const fragment = document.createDocumentFragment()
    for (const match of node.data.matchAll(pattern)) {
      fragment.append(node.data.slice(end, match.index))
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'glossary-term'
      button.dataset.glossaryTerm = match[0].toLowerCase()
      button.setAttribute('aria-expanded', 'false')
      button.textContent = match[0]
      fragment.append(button)
      end = match.index + match[0].length
    }
    if (end) {
      fragment.append(node.data.slice(end))
      node.replaceWith(fragment)
    }
  }
  return template.innerHTML
}

const CONSTRUCTS = {
  python: [[/\bf(["'])/, 'f"...{x}..."', 'f-string: wstawia wartości zmiennych w nawiasach klamrowych do tekstu.']],
  javascript: [[/`[^`]*\$\{/, '`...${x}...`', 'Template literal: wstawia wartości wyrażeń do tekstu.']],
}

/** Narzędzia użyte we wzorcowym rozwiązaniu, gdy lekcja nie ma własnej listy "toolbox". */
export function suggestTools(code, language) {
  const scope = language === 'typescript' ? 'javascript' : language
  const known = { python: pythonFunctions, javascript: javascriptFunctions }[scope]
  if (!known || !code) return []
  const used = Object.keys(known).filter((name) =>
    new RegExp(`(?<![\\w.$])${name.replace('.', '\\.')}\\s*\\(`).test(code))
  const tools = used.map((name) => ({ name: `${name}()`, description: known[name] }))
  for (const [pattern, name, description] of CONSTRUCTS[scope] || []) {
    if (pattern.test(code)) tools.push({ name, description })
  }
  return tools.slice(0, 5)
}
