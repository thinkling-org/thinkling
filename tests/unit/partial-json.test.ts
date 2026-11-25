import { describe, expect, it } from 'vitest'
import { parsePartialJson } from '../../src/lib/partialJson.ts'

describe('parsePartialJson', () => {
  it('parses completed JSON without altering it', () => {
    expect(parsePartialJson('{"title":"TypeScript","durationWeeks":2}')).toEqual({ title: 'TypeScript', durationWeeks: 2 })
  })

  it('keeps the last completed array value when only closing delimiters are missing', () => {
    const result = parsePartialJson<{ weakSpots: string[] }>('{"weakSpots":["Closures","Generics"')

    expect(result).toEqual({ weakSpots: ['Closures', 'Generics'] })
  })

  it('completes an unfinished value and ignores brackets inside escaped strings', () => {
    const result = parsePartialJson('{"examples":[{"title":"Using \\"}\\"","description":"Object lit')

    expect(result).toEqual({ examples: [{ title: 'Using "}"', description: 'Object lit' }] })
  })

  it('omits an unfinished escape sequence at the end of a value', () => {
    expect(parsePartialJson('{"title":"JSON\\')).toEqual({ title: 'JSON' })
  })

  it('discards an object key that has no value yet', () => {
    expect(parsePartialJson('{"title":"Closures","summary": ')).toEqual({ title: 'Closures' })
  })

  it('falls back to the last recoverable property after an unfinished literal', () => {
    expect(parsePartialJson('{"title":"Closures","published":tru,"summary"')).toEqual({ title: 'Closures' })
  })

  it('preserves a closed array before a dangling property', () => {
    expect(parsePartialJson('{"examples":[1,2],"title":')).toEqual({ examples: [1, 2] })
  })

  it('discards an unfinished literal inside an array', () => {
    expect(parsePartialJson('{"examples":[tru')).toEqual({ examples: [] })
  })

  it.each(['', 'not JSON', '"unfinished invalid \\q', '{unquoted'])('returns null for unrecoverable input %j', (input) => {
    expect(parsePartialJson(input)).toBeNull()
  })
})
