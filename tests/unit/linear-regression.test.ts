import { describe, expect, it } from 'vitest'
import { buildRegressionModel, evaluateRegression } from '../../src/blocks/linear-regression/regression.ts'

describe('linear regression', () => {
  it('finds a zero-error fit for points on a straight line', () => {
    const model = buildRegressionModel([{ x: 10, y: 3 }, { x: 12, y: 7 }, { x: 14, y: 11 }])
    if (!model) throw new Error('Expected a regression model')

    expect(model.fit).toEqual({ start: 3, rise: 8 })
    expect(evaluateRegression(model, model.fit)).toMatchObject({ mse: 0 })
  })

  it('reports predicted values and residuals for the line chosen by the learner', () => {
    const model = buildRegressionModel([{ x: 10, y: 3 }, { x: 12, y: 7 }, { x: 14, y: 11 }])
    if (!model) throw new Error('Expected a regression model')

    const result = evaluateRegression(model, { start: 2, rise: 4 })

    expect(result.rows).toMatchObject([
      { predicted: 2, residual: 1 },
      { predicted: 4, residual: 3 },
      { predicted: 6, residual: 5 },
    ])
    expect(result.mse).toBeCloseTo(11.6666667)
  })

  it.each([0, -5])('provides a usable chart range for a constant series at %s', (value) => {
    const model = buildRegressionModel([{ x: 0, y: value }, { x: 1, y: value }])
    if (!model) throw new Error('Expected a regression model')

    expect(model.fit).toEqual({ start: value, rise: 0 })
    expect(model.yRange[0]).toBeLessThan(value)
    expect(model.yRange[1]).toBeGreaterThan(value)
  })

  it.each([
    { name: 'a missing point list', points: null },
    { name: 'a single point', points: [{ x: 0, y: 1 }] },
    { name: 'too many points', points: Array.from({ length: 61 }, (_, x) => ({ x, y: x })) },
    { name: 'a missing point', points: [null, { x: 1, y: 1 }] },
    { name: 'a nonnumeric ordinate', points: [{ x: 0, y: '1' }, { x: 1, y: 1 }] },
    { name: 'identical x values', points: [{ x: 2, y: 0 }, { x: 2, y: 1 }] },
    { name: 'an overflowing x range', points: [{ x: -Number.MAX_VALUE, y: 0 }, { x: Number.MAX_VALUE, y: 1 }] },
    { name: 'an out-of-range y value', points: [{ x: 0, y: -2e12 }, { x: 1, y: 1 }] },
    { name: 'an x range that requires an infinite slope', points: [{ x: 0, y: 0 }, { x: Number.MIN_VALUE, y: 1 }] },
  ])('rejects $name', ({ points }) => {
    expect(buildRegressionModel(points)).toBeNull()
  })
})
