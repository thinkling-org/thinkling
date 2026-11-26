type Point = { x: number; y: number }
type RegressionPoint = Point & { xFraction: number }
type RegressionParameters = { start: number; rise: number }

function mean(values: readonly number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function buildRegressionModel(points: unknown) {
  if (!Array.isArray(points) || points.length < 2 || points.length > 60) return null
  if (!points.every((point): point is Point => Number.isFinite(point?.x) && Number.isFinite(point?.y))) return null

  const xs = points.map(({ x }) => x)
  const ys = points.map(({ y }) => y)
  const xMin = Math.min(...xs)
  const xMax = Math.max(...xs)
  const xSpan = xMax - xMin
  const yMin = Math.min(...ys)
  const yMax = Math.max(...ys)
  if (xSpan === 0 || !Number.isFinite(xSpan) || Math.max(Math.abs(yMin), Math.abs(yMax)) > 1e12) return null

  // xFraction is the fraction of the observed x range, so rise is the total change in y across that range.
  const data = points.map(({ x, y }) => ({ x, y, xFraction: (x - xMin) / xSpan }))
  const meanX = mean(data.map(({ xFraction }) => xFraction))
  const meanY = mean(ys)
  const covariance = data.reduce((sum, { xFraction, y }) => sum + (xFraction - meanX) * (y - meanY), 0)
  const variance = data.reduce((sum, { xFraction }) => sum + (xFraction - meanX) ** 2, 0)
  const rise = covariance / variance
  const start = meanY - rise * meanX
  const spread = yMax - yMin
  const ySpan = spread ? Math.max(spread, Math.abs(yMax) * Number.EPSILON * 32) : Math.abs(yMax) * 0.1 || 1
  const padding = ySpan * 0.2
  const startRange = [Math.min(yMin, start) - padding, Math.max(yMax, start) + padding]
  const maxRise = Math.max(ySpan * 1.5, Math.abs(rise) + padding)
  if (!Number.isFinite(maxRise / xSpan)) return null

  return {
    data,
    xMin,
    xMax,
    xSpan,
    yRange: [Math.min(startRange[0], start + rise - padding), Math.max(startRange[1], start + rise + padding)],
    startRange,
    riseRange: [-maxRise, maxRise],
    initial: { start: yMin - padding / 2, rise: 0 },
    fit: { start, rise },
  }
}

export function evaluateRegression({ data }: { data: readonly RegressionPoint[] }, { start, rise }: RegressionParameters) {
  const rows = data.map((point) => {
    const predicted = start + rise * point.xFraction
    return { ...point, predicted, residual: point.y - predicted }
  })
  return { rows, mse: mean(rows.map(({ residual }) => residual ** 2)) }
}
