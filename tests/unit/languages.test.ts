import { describe, expect, it } from 'vitest'
import { interfaceLanguage, languageName, normalizeLocale, preferredLocale } from '../../src/lib/languages.ts'

describe('normalizeLocale', () => {
  it('canonicalizes language, script and region while dropping extensions', () => {
    expect(normalizeLocale('zh-hant-tw-u-ca-gregory')).toBe('zh-Hant-TW')
  })

  it.each([null, 42, '', 'en_US', 'und-PL', 'en-' + 'a'.repeat(68)])('rejects %j', (value) => {
    expect(normalizeLocale(value)).toBeNull()
  })
})

describe('preferredLocale', () => {
  it('chooses the first valid system locale even if the interface has no translation for it', () => {
    expect(preferredLocale(['invalid_tag', 'fr-ca', 'pl'])).toBe('fr-CA')
  })

  it('defaults to English when the system has no usable locale', () => {
    expect(preferredLocale()).toBe('en')
    expect(preferredLocale(['und', '*'])).toBe('en')
  })
})

describe('interfaceLanguage', () => {
  it('uses Polish for regional Polish preferences', () => {
    expect(interfaceLanguage('PL-pl')).toBe('pl')
  })

  it.each(['fr-CA', null, ''])('uses English for an unsupported preference %j', (locale) => {
    expect(interfaceLanguage(locale)).toBe('en')
  })
})

describe('languageName', () => {
  it('displays the language name in the requested language', () => {
    expect(languageName('fr', 'pl')).toBe('francuski')
  })

  it('describes English when a locale cannot be identified', () => {
    expect(languageName('und')).toBe('English')
  })
})
