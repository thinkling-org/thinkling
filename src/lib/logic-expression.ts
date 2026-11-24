// Parse logic expressions for circuits.
// Accept input names, 0/1, parentheses, NOT/!/¬, AND/&&/&/∧, XOR/^/⊕/!==, and OR/||/|/∨.
// Precedence is NOT, AND, XOR, OR. Return an evaluator that yields 0 or 1, or null if parsing fails.

const OPERATORS = [
  ['!==', 'xor'], ['&&', 'and'], ['||', 'or'],
  ['!', 'not'], ['¬', 'not'], ['~', 'not'],
  ['&', 'and'], ['∧', 'and'], ['*', 'and'], ['·', 'and'],
  ['|', 'or'], ['∨', 'or'], ['+', 'or'],
  ['^', 'xor'], ['⊕', 'xor'],
  ['(', '('], [')', ')'],
]
const WORDS = { and: 'and', or: 'or', xor: 'xor', not: 'not', i: 'and', lub: 'or', nie: 'not' }

function tokenize(source) {
  const tokens = []
  let rest = String(source).trim()
  while (rest) {
    const space = rest.match(/^\s+/)
    if (space) { rest = rest.slice(space[0].length); continue }
    const word = rest.match(/^[A-Za-z_][\w]*/)
    if (word) {
      const lower = word[0].toLowerCase()
      tokens.push(WORDS[lower] && word[0] === word[0].toUpperCase() ? { op: WORDS[lower] } : { id: word[0] })
      rest = rest.slice(word[0].length)
      continue
    }
    const digit = rest.match(/^[01]/)
    if (digit) { tokens.push({ value: Number(digit[0]) }); rest = rest.slice(1); continue }
    const operator = OPERATORS.find(([symbol]) => rest.startsWith(symbol))
    if (!operator) return null
    tokens.push({ op: operator[1] })
    rest = rest.slice(operator[0].length)
  }
  return tokens
}

export function compileLogic(source, inputIds) {
  const tokens = tokenize(source)
  if (!tokens?.length) return null
  const known = new Set(inputIds)
  let index = 0
  const peek = () => tokens[index]
  const take = (op) => (peek()?.op === op ? (index++, true) : false)

  const binary = (next, op, combine) => () => {
    let left = next()
    while (left && take(op)) {
      const right = next()
      if (!right) return null
      const l = left
      left = (env) => combine(l(env), right(env))
    }
    return left
  }
  const unary = () => {
    if (take('not')) {
      const inner = unary()
      return inner && ((env) => 1 - inner(env))
    }
    if (take('(')) {
      const inner = or()
      return inner && take(')') ? inner : null
    }
    const token = tokens[index++]
    if (token?.value !== undefined) return () => token.value
    if (token?.id && known.has(token.id)) return (env) => (env[token.id] ? 1 : 0)
    return null
  }
  const and = binary(unary, 'and', (a, b) => a & b)
  const xor = binary(and, 'xor', (a, b) => a ^ b)
  const or = binary(xor, 'or', (a, b) => a | b)

  const evaluate = or()
  return evaluate && index === tokens.length ? evaluate : null
}
