export const DEFAULT_LOCALE = 'en'
export const INTERFACE_LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'pl', label: 'Polski' },
]

export function normalizeLocale(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 70) return null
  try {
    const locale = new Intl.Locale(value)
    return locale.language === 'und' ? null : locale.baseName
  } catch {
    return null
  }
}

export function preferredLocale(languages: readonly string[] = []): string {
  for (const value of languages) {
    const locale = normalizeLocale(value)
    if (locale) return locale
  }
  return DEFAULT_LOCALE
}

export function interfaceLanguage(locale: unknown): string {
  const base = typeof locale === 'string' ? locale.split('-')[0].toLowerCase() : null
  return INTERFACE_LANGUAGES.some(({ value }) => value === base) ? base : DEFAULT_LOCALE
}

export function languageName(locale: unknown, displayLocale = DEFAULT_LOCALE) {
  const language = normalizeLocale(locale) || DEFAULT_LOCALE
  return new Intl.DisplayNames([displayLocale], { type: 'language' }).of(language)
}
