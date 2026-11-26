import { computed } from 'vue'
import { DEFAULT_LOCALE, interfaceLanguage } from './languages.ts'
import { translate, translateWith } from './translation.ts'
import type { MessageCatalogs } from './translation.ts'

let readLocale = () => DEFAULT_LOCALE

export function configureLocale(getLocale: () => string) {
  readLocale = getLocale
}

export function uiLocale() {
  return interfaceLanguage(readLocale())
}

export function numberFormatter(options?: Intl.NumberFormatOptions) {
  const formatter = computed(() => new Intl.NumberFormat(uiLocale(), options))
  return (value: number) => formatter.value.format(value)
}

export function t(message: string, values?: readonly unknown[]) {
  return translate(readLocale(), message, values)
}

/** A `t` bound to a module's own catalogs and the current interface language. */
export function createTranslator(catalogs: MessageCatalogs) {
  return (message: string, values?: readonly unknown[]) => translateWith(catalogs, readLocale(), message, values)
}
