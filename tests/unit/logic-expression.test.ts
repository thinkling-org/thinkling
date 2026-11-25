import { describe, expect, it } from 'vitest'
import { readLessonVisualization } from '../../src/lib/lesson-visualizations.ts'
import { compileLogic } from '../../src/lib/logic-expression.ts'

describe('compileLogic', () => {
  it('evaluates a known input whose name is also an object property', () => {
    const evaluate = compileLogic('CONSTRUCTOR AND 1', ['CONSTRUCTOR'])

    expect(evaluate?.({ CONSTRUCTOR: 1 })).toBe(1)
  })

  it('uses the specified operator precedence and lets parentheses override it', () => {
    const inputs = { a: true, b: false, c: false, d: true }

    expect(compileLogic('a OR b XOR NOT c AND d', Object.keys(inputs))?.(inputs)).toBe(1)
    expect(compileLogic('(a OR b) XOR (NOT c AND d)', Object.keys(inputs))?.(inputs)).toBe(0)
  })

  it('accepts symbolic operators alongside lowercase input names', () => {
    const evaluate = compileLogic('i && !(a || b) !== a', ['i', 'a', 'b'])

    expect(evaluate?.({ i: 1, a: 0, b: 0 })).toBe(1)
    expect(evaluate?.({ i: 0, a: 0, b: 0 })).toBe(0)
    expect(evaluate?.({ i: 0, a: 1, b: 0 })).toBe(1)
  })

  it('accepts I as an input in a generated lesson circuit', () => {
    const circuit = readLessonVisualization({
      type: 'learn',
      visualization: {
        type: 'logic-circuit',
        instruction: 'Turn both inputs on to light the output.',
        inputs: [{ id: 'I' }, { id: 'A' }],
        outputs: [{ label: 'Ready', expression: 'I AND A' }],
      },
    })

    expect(circuit?.inputs.map(({ id }) => id)).toEqual(['I', 'A'])
    expect(circuit?.outputs[0].evaluate({ I: 1, A: 1 })).toBe(1)
  })

  it('defaults unset inputs to zero even when their names match inherited properties', () => {
    const evaluate = compileLogic('constructor', ['constructor'])

    expect(evaluate?.({})).toBe(0)
    expect(evaluate?.({ constructor: false })).toBe(0)
  })

  it.each(['', 'unknown', 'a AND', 'NOT', '(a OR b', '()', 'a b', 'a @ b', '1 0', 'a I b', 'a LUB b', 'NIE a'])(
    'rejects the incomplete or invalid expression %j', (expression) => {
      expect(compileLogic(expression, ['a', 'b'])).toBeNull()
    },
  )
})
