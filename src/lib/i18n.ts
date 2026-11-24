import { computed } from 'vue'
import { DEFAULT_LOCALE, interfaceLanguage } from './languages.ts'
import { translate } from './translation.ts'

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
