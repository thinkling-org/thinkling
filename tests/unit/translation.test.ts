import { describe, expect, it } from 'vitest'
import { translate } from '../../src/lib/translation.ts'

describe('translate', () => {
  it('finds a Polish translation for a regional locale', () => {
    expect(translate('pl-PL', 'Restore starter files')).toBe('Przywróć pliki szablonu')
  })

  it('substitutes values in the translated message', () => {
    expect(translate('pl', '{0} days', [0])).toBe('0 dni')
  })

  it('falls back to the English message for an unsupported language or missing translation', () => {
    expect(translate('fr-CA', 'Restore starter files')).toBe('Restore starter files')
    expect(translate('pl', 'New English message')).toBe('New English message')
  })

  it('treats inherited object properties as missing translations', () => {
    expect(translate('pl', 'constructor')).toBe('constructor')
  })

  it('uses supplied values literally and preserves placeholders without a value', () => {
    expect(translate('en', '{1} to {0}, {1} to {2}', [42, '$&'])).toBe('$& to 42, $& to {2}')
    expect(translate('en', 'Count: {0}', [])).toBe('Count: {0}')
  })
})
