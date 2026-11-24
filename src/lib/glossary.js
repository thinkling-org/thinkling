import { shallowRef } from 'vue'
import { t } from './i18n.js'

export const activeTerm = shallowRef(null)

const terms = [
  ['TDZ', ['TDZ', 'temporal dead zone'], 'The period between entering a scope and initializing a let, const, or class declaration. Reading the binding in this period throws a ReferenceError.'],
  ['Hoisting', ['hoisting', 'hoistingu'], 'The engine prepares declaration bindings before running code in a scope. For example, var starts as undefined, while let and const remain in the TDZ until initialization.'],
  ['Closure', ['closure', 'closures', 'domknięcie', 'domknięcia'], 'A function retains access to bindings from the scope where it was created, even after that scope exits. Calling it reads the current value of the captured binding.'],
  ['Lexical scope', ['zakres leksykalny', 'lexical scope'], 'Where the code is written determines which names are accessible. A function can look up names in its own scope and enclosing scopes.'],
  ['Shadowing', ['shadowing', 'przesłanianie'], 'An inner declaration can have the same name as an outer one. References in the inner scope resolve to the nearer binding.'],
  ['Execution context', ['execution context', 'kontekst wykonania', 'kontekstu wykonania'], 'The state the engine uses to run a piece of code, including information needed to resolve names and determine this.'],
  ['Event loop', ['event loop', 'pętla zdarzeń'], 'The mechanism by which the runtime runs successive tasks. After a task completes, the runtime drains the microtask queue before running the next task.'],
  ['Microtask', ['microtask', 'microtasks', 'mikrozadanie', 'mikrozadania', 'mikrozadań'], 'A task run while draining the microtask queue. Promise reactions are one example.'],
  ['Macrotask', ['macrotask', 'macrotasks', 'makrozadanie', 'makrozadania', 'makrozadań'], 'An informal name for an event-loop task. A callback given to setTimeout runs as one when the runtime selects it.'],
  ['ReferenceError', ['ReferenceError'], 'An error thrown when the engine cannot read a binding, for example because a name is unknown or is still in the TDZ.'],
  ['TypeError', ['TypeError'], 'An error thrown when a value does not support the operation, such as trying to call a number as a function.'],
]

const definitions = new Map(terms.flatMap(([title, aliases, definition]) =>
  aliases.map((alias) => [alias.toLowerCase(), { title, definition }]),
))
const pythonFunctions = {
  print: 'Prints the supplied values. By default it separates them with spaces and ends with a newline.',
  input: 'Reads one line of user input and returns it as text.',
  len: 'Returns the number of items, such as characters in a string or elements in a list.',
  range: 'Creates a range of integers. The end value is excluded.',
  int: 'Converts a value to an integer. It truncates the fractional part.',
  float: 'Converts a number or string to a floating-point number.',
  str: 'Returns the string representation of a value.',
  bool: 'Evaluates a value in a Boolean context and returns True or False.',
  type: 'With one argument, returns its type.',
  round: 'Rounds a number. An optional second argument specifies decimal places.',
  abs: 'Returns the absolute value. For a complex number, returns its magnitude.',
  sum: 'Adds the values from an iterable, such as a list.',
  min: 'Returns the smallest value.',
  max: 'Returns the largest value.',
  list: 'Creates a list, for example from a range or string.',
  dict: 'Creates a dictionary of key-value pairs.',
  set: 'Creates a set of unique items.',
  tuple: 'Creates a tuple, an ordered collection whose elements cannot be reassigned.',
  sorted: 'Returns a new sorted list.',
  enumerate: 'Yields pairs of an index and an item. The index starts at zero by default.',
  zip: 'Combines items at matching positions into tuples. It stops at the shortest input by default.',
  map: 'Applies a function to each item and yields its result.',
  filter: 'Yields only items for which the supplied function returns a truthy value.',
  any: 'Returns True if at least one item is truthy.',
  all: 'Returns True if every item is truthy. Also returns True for empty input.',
}
const javascriptFunctions = {
  'console.log': 'Prints values to the console for inspection while the program runs.',
  parseInt: 'Parses an integer from the start of a string. A second argument can specify the radix.',
  parseFloat: 'Parses a number, including a fractional part, from the start of a string.',
  isNaN: 'Converts the argument to a number and then checks whether it is NaN.',
}
const codeDefinitions = new Map(
  Object.entries({ python: pythonFunctions, javascript: javascriptFunctions }).flatMap(([language, entries]) =>
    Object.entries(entries).map(([name, definition]) => [`${language}:${name}`, { title: `${name}()`, definition }]),
  ),
)
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const aliases = [...definitions.keys()].sort((a, b) => b.length - a.length).map(escape)
const pattern = new RegExp(`(?<![\\p{L}\\p{N}_$])(?:${aliases.join('|')})(?![\\p{L}\\p{N}_$])`, 'giu')

export function glossaryEntry(term) {
  const entry = definitions.get(term) || codeDefinitions.get(term)
  return entry && { title: t(entry.title), definition: t(entry.definition) }
}

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
  python: [[/\bf(["'])/, 'f"...{x}..."', 'f-string: inserts variable values in braces into the string.']],
  javascript: [[/`[^`]*\$\{/, '`...${x}...`', 'Template literal: inserts expression values into the string.']],
}

/** Infer toolbox entries from the reference solution when a lesson has none. */
export function suggestTools(code, language) {
  const scope = language === 'typescript' ? 'javascript' : language
  const known = { python: pythonFunctions, javascript: javascriptFunctions }[scope]
  if (!known || !code) return []
  const used = Object.keys(known).filter((name) =>
    new RegExp(`(?<![\\w.$])${name.replace('.', '\\.')}\\s*\\(`).test(code))
  const tools = used.map((name) => ({ name: `${name}()`, description: t(known[name]) }))
  for (const [pattern, name, description] of CONSTRUCTS[scope] || []) {
    if (pattern.test(code)) tools.push({ name, description: t(description) })
  }
  return tools.slice(0, 5)
}
