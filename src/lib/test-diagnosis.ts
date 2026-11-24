import { t } from './i18n.ts'
// Extract expected and actual values from test errors and describe the difference locally.


const QUOTED = /expected:?\s+(['"`])((?:\\.|(?!\1).)*)\1[\s,;]*(?:but\s+)?(?:got|received|actual|was|otrzymano|dostałem|jest)\s*:?\s*(['"`])((?:\\.|(?!\3).)*)\3/is
const NUMBERS = /expected:?\s+(-?\d+(?:[.,]\d+)?)[\s,;]*(?:but\s+)?(?:got|received|actual|was|otrzymano|jest)\s*:?\s*(-?\d+(?:[.,]\d+)?)/i

const NAMES = {
  '.': 'period', ',': 'comma', ';': 'semicolon', ':': 'colon', ' ': 'space', '\n': 'newline',
  '\t': 'tab', '"': 'quotation mark', "'": 'apostrophe', '!': 'exclamation mark', '?': 'question mark',
  '-': 'minus sign', '(': 'parenthesis', ')': 'parenthesis', '[': 'square bracket', ']': 'square bracket',
}

function unescape(text) {
  return text.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (_, code) => {
    if (code[0] === 'u' || code[0] === 'x') return String.fromCharCode(parseInt(code.slice(1), 16))
    return { n: '\n', t: '\t', r: '\r', 0: '\0' }[code] ?? code
  })
}

/** Render whitespace characters visibly in the diff. */
export const visible = (text) => text.replace(/\n/g, '↵').replace(/\t/g, '⇥')

function describeChars(text) {
  const shown = visible(text)
  const names = [...text].map((char) => NAMES[char]).filter(Boolean).map((name) => t(name))
  return names.length === [...text].length && names.length <= 2 ? `„${shown}” (${names.join(', ')})` : `„${shown}”`
}

function compare(expected, got) {
  let start = 0
  while (start < expected.length && start < got.length && expected[start] === got[start]) start++
  let end = 0
  while (end < expected.length - start && end < got.length - start
    && expected[expected.length - 1 - end] === got[got.length - 1 - end]) end++
  const missing = expected.slice(start, expected.length - end)
  const extra = got.slice(start, got.length - end)

  let kind = 'different'
  let message
  const small = (text) => text.length > 0 && text.length <= 3
  const a = Number(expected.trim().replace(',', '.'))
  const b = Number(got.trim().replace(',', '.'))
  const onlySpaces = expected.replace(/\s+/g, '') === got.replace(/\s+/g, '')
  if (expected.trim() && got.trim() && Number.isFinite(a) && Number.isFinite(b)) {
    kind = 'number'
    message = t('Number mismatch: expected {0}, got {1} (difference {2}).', [expected.trim(), got.trim(), +(b - a).toFixed(6)])
  } else if (expected !== got && expected.toLowerCase() === got.toLowerCase()) {
    kind = 'case'
    message = t('The text matches except for letter case.')
  } else if (!missing && small(extra)) {
    kind = 'extra'
    message = t('You have {0} too many: {1}.', [extra.length === 1 ? t('one character') : t('a few characters'), describeChars(extra)])
  } else if (!extra && small(missing)) {
    kind = 'missing'
    message = t('You are missing {0}: {1}.', [missing.length === 1 ? t('a single character') : t('several characters'), describeChars(missing)])
  } else if (onlySpaces) {
    kind = 'whitespace'
    message = t('The content matches except for spaces or line breaks.')
  } else if (small(missing) && small(extra)) {
    kind = 'replaced'
    message = t('Expected {0}, got {1}.', [describeChars(missing), describeChars(extra)])
  } else {
    message = t('The result differs from the expected output. Compare the highlighted section.')
  }
  return { kind, message, start, missing, extra, nearMiss: kind !== 'different' }
}

function parse(error) {
  const quoted = String(error || '').match(QUOTED)
  if (quoted) return { expected: unescape(quoted[2]), got: unescape(quoted[4]) }
  const numbers = String(error || '').match(NUMBERS)
  return numbers ? { expected: numbers[1], got: numbers[2] } : null
}

/** Find the line of the learner’s code most likely responsible for the difference. */
function locate(code, got, diff) {
  if (!code || diff.kind === 'case' || diff.kind === 'whitespace') return null
  const before = got.slice(Math.max(0, diff.start - 6), diff.start).replace(/^.*\n/s, '')
  const candidates = diff.extra
    ? [before + diff.extra, before.slice(-2) + diff.extra, diff.extra.trim().length > 1 ? diff.extra : '']
    : [before.slice(-4)]
  const lines = code.split('\n')
  for (const snippet of candidates.map((s) => s.replace(/\s+$/, ''))) {
    if (snippet.trim().length < 2) continue
    const hits = lines.map((text, i) => ({ text, line: i + 1 })).filter(({ text }) => text.includes(snippet))
    if (hits.length === 1) return { line: hits[0].line, text: hits[0].text.trim() }
  }
  return null
}

export function diagnoseRun(run, code = '') {
  const failed = (run?.results || []).filter((r) => !r.ok)
  if (!failed.length || run.compileError) return null
  const cases = failed.map((r) => {
    const values = parse(r.error)
    return values && { name: r.name, ...values, diff: compare(values.expected, values.got) }
  }).filter(Boolean)
  if (!cases.length) return null

  const first = cases[0]
  const signature = (c) => `${c.diff.kind}|${c.diff.missing}|${c.diff.extra}`
  const same = cases.length > 1 && cases.length === failed.length && cases.every((c) => signature(c) === signature(first))
  const total = run.results.length
  const passed = total - failed.length
  let headline
  if (first.diff.nearMiss && same) headline = t('Almost! All {0} failed tests have the same small issue.', [failed.length])
  else if (first.diff.nearMiss) headline = passed ? t('Almost! {0} of {1} tests pass. The remaining results differ slightly.', [passed, total]) : t('Almost! The result differs by one small detail.')
  else headline = t('The result differs from the expected output in {0} of {1} tests.', [failed.length, total])

  return {
    headline,
    message: first.diff.message,
    name: first.name,
    expected: first.expected,
    got: first.got,
    diff: first.diff,
    location: locate(code, first.got, first.diff),
    nearMiss: first.diff.nearMiss,
  }
}
