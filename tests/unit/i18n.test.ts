import { afterEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { configureLocale, numberFormatter, t, uiLocale } from '../../src/lib/i18n.ts'

afterEach(() => configureLocale(() => 'en'))

describe('interface localization', () => {
  it('uses English before a language preference is configured', () => {
    expect(uiLocale()).toBe('en')
    expect(t('Restore starter files')).toBe('Restore starter files')
  })

  it('updates translations and existing number formatters when the preference changes', () => {
    const locale = ref('en-US')
    configureLocale(() => locale.value)
    const format = numberFormatter({ minimumFractionDigits: 2 })

    expect(format(1.5)).toBe('1.50')

    locale.value = 'pl-PL'

    expect(uiLocale()).toBe('pl')
    expect(t('{0} days', [5])).toBe('5 dni')
    expect(format(1.5)).toBe('1,50')
  })
})
