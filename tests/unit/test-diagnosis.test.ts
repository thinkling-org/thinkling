import { describe, expect, it } from 'vitest'
import { diagnoseRun, visible } from '../../src/lib/test-diagnosis.ts'

const failure = (error: string, name = 'output') => ({ name, ok: false, error })

describe('learner test diagnostics', () => {
  it.each([null, {}, { results: [{ name: 'ok', ok: true }] }, { results: [failure('crash')] }, { compileError: 'Syntax error', results: [failure('expected 1 got 2')] }])('does not invent a diagnosis for %j', (run) => {
    expect(diagnoseRun(run)).toBeNull()
  })

  it.each([
    ['expected -1.5, received 2.5', 'number', '-1.5', '2.5'],
    ['expected: 1,5 otrzymano: 2,5', 'number', '1,5', '2,5'],
    ['expected "Hello" but got "hello"', 'case', 'Hello', 'hello'],
    ['expected "Hi" received "Hi!"', 'extra', 'Hi', 'Hi!'],
    ['expected "Hi!" actual "Hi"', 'missing', 'Hi!', 'Hi'],
    ['expected "a b c d" got "abcd"', 'whitespace', 'a b c d', 'abcd'],
    ['expected "cat" was "cut"', 'replaced', 'cat', 'cut'],
    ['expected "expected result" got "unrelated output"', 'different', 'expected result', 'unrelated output'],
    ['expected "Hi\\n\\t\\u0041\\x42" got "Hi"', 'different', 'Hi\n\tAB', 'Hi'],
  ])('explains %s', (error, kind, expected, got) => {
    const diagnosis = diagnoseRun({ results: [failure(error)] })
    expect(diagnosis).toMatchObject({ name: 'output', expected, got, diff: { kind }, nearMiss: kind !== 'different' })
    expect(diagnosis.message.length).toBeGreaterThan(10)
  })

  it('reports a repeated small issue across all failures', () => {
    const diagnosis = diagnoseRun({ results: [failure('expected "Hi" got "Hi!"'), failure('expected "Bye" got "Bye!"', 'farewell')] })
    expect(diagnosis.headline).toBe('Almost! All 2 failed tests have the same small issue.')
  })

  it('counts passed tests and identifies a unique line containing the incorrect output', () => {
    const diagnosis = diagnoseRun({ results: [{ name: 'other', ok: true }, failure('expected "Hello" got "Hello!"')] }, 'const value = 1;\nconsole.log("Hello!");')
    expect(diagnosis.headline).toContain('1 of 2 tests pass')
    expect(diagnosis.location).toEqual({ line: 2, text: 'console.log("Hello!");' })
    expect(diagnosis.diff).toMatchObject({ start: 5, missing: '', extra: '!' })
  })

  it('does not point at an ambiguous line or a case-only difference', () => {
    expect(diagnoseRun({ results: [failure('expected "Hello" got "Hello!"')] }, '"Hello!"\n"Hello!"').location).toBeNull()
    expect(diagnoseRun({ results: [failure('expected "Hello" got "hello"')] }, '"hello"').location).toBeNull()
  })

  it('uses the generic headline for a substantially different result', () => {
    expect(diagnoseRun({ results: [failure('expected "expected output" got "another result"')] }).headline).toBe('The result differs from the expected output in 1 of 1 tests.')
    expect(visible('a\nb\tc')).toBe('a↵b⇥c')
  })
})
