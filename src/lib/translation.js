import english from '../locales/en.js'
import { interfaceLanguage } from './languages.js'

export function translate(locale, message, values = []) {
  const text = interfaceLanguage(locale) === 'en' && Object.hasOwn(english, message)
    ? english[message]
    : message
  if (!values.length) return text
  return text.replace(/\{(\d+)\}/g, (match, index) => index < values.length ? String(values[index]) : match)
}
