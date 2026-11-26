import { describe, expect, it } from 'vitest'
import { describeVisualization, readLessonVisualization } from '../../src/blocks/registry.ts'

const read = (visualization: Record<string, unknown>) => readLessonVisualization({ type: 'learn', visualization })
const chart = () => ({ type: 'value-chart', instruction: 'Compare growth', xLabel: 'n', yLabel: 'steps', xs: [1, 2], series: [{ label: 'Linear', values: [1, 2] }], notes: [] })
const diagnosis = () => ({ type: 'diagnosis', instruction: 'Find the cause', symptom: 'No response', checks: [{ name: 'Network', action: 'Ping', result: 'Online', ok: true }, { name: 'Service', action: 'Check', result: 'Stopped', ok: false }], options: [{ text: 'Network', why: 'It is online', correct: false }, { text: 'Service', why: 'It is stopped', correct: true }] })

describe('model-generated block data at the registry boundary', () => {
  it('normalizes chart notes and discards malformed series', () => {
    const normalized = read({ ...chart(), yMax: -1, series: [...chart().series, { label: 'Bad', values: [1] }], notes: [{ from: 2, say: 'Later' }, { from: 1, say: 'First' }, { from: 'bad', say: 'Invalid' }] })
    expect(normalized).toMatchObject({ yMax: null, notes: [{ from: 1, say: 'First' }, { from: 2, say: 'Later' }], series: [{ label: 'Linear', values: [1, 2] }] })
    expect(describeVisualization(normalized)).toBe('Chart of steps versus n. x: 1, 2\nLinear: 1, 2')
  })

  it.each([
    { instruction: '' }, { xs: [] }, { xs: [1, 1] }, { xs: [2, 1] }, { xs: [1, Infinity] }, { series: [] }, { series: [{ label: 'Bad', values: [1, NaN] }] },
  ])('rejects invalid chart data %j', (invalid) => {
    expect(read({ ...chart(), ...invalid })).toBeNull()
  })

  it('normalizes measurement and diagnosis defaults and describes the correct option', () => {
    const normalized = read(diagnosis())
    expect(normalized.checks[0].detail).toBe('')
    expect(describeVisualization(normalized)).toContain('Service (correct)')
    expect(describeVisualization(normalized)).toContain('Network (Ping): Online')
  })

  it.each([
    { instruction: '' }, { symptom: '' }, { checks: [] }, { checks: [{ name: 'Incomplete' }] }, { options: [] },
    { options: [{ text: 'A', why: 'A', correct: true }, { text: 'B', why: 'B', correct: true }] },
    { options: [{ text: 'A', why: 'A' }, { text: 'B', why: 'B' }] },
  ])('rejects ambiguous or incomplete diagnosis data %j', (invalid) => {
    expect(read({ ...diagnosis(), ...invalid })).toBeNull()
  })

  it('normalizes state inspection without code and removes invalid items and details', () => {
    const normalized = read({ type: 'state-inspector', layout: 'unknown', steps: [
      { say: 'Push', line: 99, items: [{ label: 'Frame', details: [{ name: 'x', value: '1' }, { name: '', value: 'invalid' }] }, null] },
      { say: 'Pop', items: [] }, { say: '', items: [{ label: 'ignored' }] },
    ] })
    expect(normalized).toMatchObject({ code: '', instruction: '', layout: 'list', label: 'State', steps: [
      { line: null, say: 'Push', items: [{ label: 'Frame', status: '', details: [{ name: 'x', value: '1' }] }] },
      { line: null, say: 'Pop', items: [] },
    ] })
    expect(describeVisualization(normalized)).toContain('1. Push [Frame]')
  })

  it.each([
    { steps: [] },
    { steps: [{ say: 'Only one', items: [{ label: 'Frame' }] }] },
    { steps: [{ say: 'One', items: [] }, { say: 'Two', items: [] }] },
  ])('rejects incomplete inspector steps $steps', ({ steps }) => {
    expect(read({ type: 'state-inspector', steps })).toBeNull()
  })

  it('keeps only trace steps that point at real code lines', () => {
    const normalized = read({ type: 'step-trace', code: 'let x = 1;\nx++;', steps: [
      { line: 1, say: 'Initialize', variables: [{ name: 'x', value: '1' }] },
      { line: 99, say: 'Not a real line' },
      { line: 2, say: 'Increment', variables: [{ name: 'x', value: '2' }], output: '2' },
    ] })
    expect(normalized.steps).toHaveLength(2)
    expect(normalized.steps[0].output).toBe('')
    expect(describeVisualization(normalized)).toContain('line 1: Initialize (x=1)')
    expect(read({ type: 'step-trace', code: '' })).toBeNull()
    expect(read({ type: 'step-trace', code: 'one line', steps: [{ line: 1, say: 'Only one' }] })).toBeNull()
  })

  it('deduplicates definition tokens and only keeps definitions for code that exists', () => {
    const normalized = read({ type: 'code-definitions', code: 'let x = 1', terms: [
      { token: ' let ', title: 'Let', definition: 'Mutable binding' },
      { token: 'let', title: 'Duplicate', definition: 'Repeated' },
      { token: 'absent', title: 'Absent', definition: 'Not in code' },
      { token: 'x', title: 'Incomplete' },
    ] })
    expect(normalized.terms).toEqual([{ token: 'let', title: 'Let', definition: 'Mutable binding', kind: '', example: '' }])
    expect(describeVisualization(normalized)).toBe('Definitions in code:\nlet x = 1\n- let: Mutable binding')
    expect(read({ type: 'code-definitions', code: '', terms: [] })).toBeNull()
    expect(read({ type: 'code-definitions', code: 'x', terms: [] })).toBeNull()
  })
})
