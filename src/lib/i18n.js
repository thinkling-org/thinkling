import { computed } from 'vue'
import { DEFAULT_LOCALE, interfaceLanguage } from './languages.js'
import { translate } from './translation.js'

let readLocale = () => DEFAULT_LOCALE

export function configureLocale(getLocale) {
  readLocale = getLocale
}

export function uiLocale() {
  return interfaceLanguage(readLocale())
}

export function numberFormatter(options) {
  const formatter = computed(() => new Intl.NumberFormat(uiLocale(), options))
  return (value) => formatter.value.format(value)
}

export function t(message, values) {
  return translate(readLocale(), message, values)
}
