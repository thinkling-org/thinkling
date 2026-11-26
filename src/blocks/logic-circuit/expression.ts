// Parse logic expressions for circuits.
// Accept input names, 0/1, parentheses, NOT/!/¬, AND/&&/&/∧, XOR/^/⊕/!==, and OR/||/|/∨.
// Precedence is NOT, AND, XOR, OR. Return an evaluator that yields 0 or 1, or null if parsing fails.

type Bit = 0 | 1
const WORD_OPERATORS = { AND: 'and', OR: 'or', XOR: 'xor', NOT: 'not' } as const
type WordOperator = keyof typeof WORD_OPERATORS
type Operator = (typeof WORD_OPERATORS)[WordOperator] | '(' | ')'
type Token = { op?: Operator; id?: string; value?: Bit }
type Evaluator = (inputs: Readonly<Record<string, number | boolean>>) => Bit

const OPERATORS: readonly (readonly [string, Operator])[] = [
  ['!==', 'xor'], ['&&', 'and'], ['||', 'or'],
  ['!', 'not'], ['¬', 'not'], ['~', 'not'],
  ['&', 'and'], ['∧', 'and'], ['*', 'and'], ['·', 'and'],
  ['|', 'or'], ['∨', 'or'], ['+', 'or'],
  ['^', 'xor'], ['⊕', 'xor'],
  ['(', '('], [')', ')'],
]

export function isLogicOperator(text: string): text is WordOperator {
  return Object.hasOwn(WORD_OPERATORS, text)
}

function tokenize(source: unknown): Token[] | null {
  const tokens: Token[] = []
  let rest = String(source).trim()
  while (rest) {
    const space = rest.match(/^\s+/)
    if (space) {
      rest = rest.slice(space[0].length)
      continue
    }
    const word = rest.match(/^[A-Za-z_][\w]*/)
    if (word) {
      const [text] = word
      tokens.push(isLogicOperator(text) ? { op: WORD_OPERATORS[text] } : { id: text })
      rest = rest.slice(text.length)
      continue
    }
    const digit = rest.match(/^[01]/)
    if (digit) {
      tokens.push({ value: digit[0] === '1' ? 1 : 0 })
      rest = rest.slice(1)
      continue
    }
    const operator = OPERATORS.find(([symbol]) => rest.startsWith(symbol))
    if (!operator) return null
    tokens.push({ op: operator[1] })
    rest = rest.slice(operator[0].length)
  }
  return tokens
}

export function compileLogic(source: unknown, inputIds: readonly string[]): Evaluator | null {
  const tokens = tokenize(source)
  if (!tokens?.length) return null
  const known = new Set(inputIds)
  let index = 0
  const take = (op: Operator) => {
    if (tokens[index]?.op !== op) return false
    index++
    return true
  }

  const binary = (next: () => Evaluator | null, op: Operator, combine: (a: Bit, b: Bit) => Bit) => (): Evaluator | null => {
    let left = next()
    while (left && take(op)) {
      const right = next()
      if (!right) return null
      const l = left
      left = (env) => combine(l(env), right(env))
    }
    return left
  }
  const unary = (): Evaluator | null => {
    if (take('not')) {
      const inner = unary()
      return inner && ((env) => inner(env) ? 0 : 1)
    }
    if (take('(')) {
      const inner = or()
      return inner && take(')') ? inner : null
    }
    const token = tokens[index++]
    if (token?.value !== undefined) return () => token.value
    if (token?.id && known.has(token.id)) {
      const { id } = token
      return (env) => Object.hasOwn(env, id) && env[id] ? 1 : 0
    }
    return null
  }
  const and = binary(unary, 'and', (a, b) => (a & b) as Bit)
  const xor = binary(and, 'xor', (a, b) => (a ^ b) as Bit)
  const or = binary(xor, 'or', (a, b) => (a | b) as Bit)

  const evaluate = or()
  return evaluate && index === tokens.length ? evaluate : null
}
