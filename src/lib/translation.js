import polish from '../locales/pl.js'
import { interfaceLanguage } from './languages.js'

const catalogs = { pl: polish }

export function translate(locale, message, values = []) {
  const catalog = catalogs[interfaceLanguage(locale)]
  const text = catalog && Object.hasOwn(catalog, message)
    ? catalog[message]
    : message
  if (!values.length) return text
  return text.replace(/\{(\d+)\}/g, (match, index) => index < values.length ? String(values[index]) : match)
}
