import polish from '../locales/pl.ts'
import { interfaceLanguage } from './languages.ts'

type MessageCatalog = Record<string, string>
const catalogs: Record<string, MessageCatalog | undefined> = { pl: polish }

export function translate(locale: unknown, message: string, values: readonly unknown[] = []): string {
  const catalog = catalogs[interfaceLanguage(locale)]
  const text = catalog && Object.hasOwn(catalog, message)
    ? catalog[message]
    : message
  if (!values.length) return text
  return text.replace(/\{(\d+)\}/g, (match, index: string) => Number(index) < values.length ? String(values[Number(index)]) : match)
}
