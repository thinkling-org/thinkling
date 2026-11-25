import polish from '../locales/pl.ts'
import { interfaceLanguage } from './languages.ts'
import type { InterfaceLanguage } from './languages.ts'

type MessageCatalog = Readonly<Record<string, string>>
const catalogs: Partial<Record<InterfaceLanguage, MessageCatalog>> = { pl: polish }

export function translate(locale: unknown, message: string, values: readonly unknown[] = []): string {
  const catalog = catalogs[interfaceLanguage(locale)]
  const text = catalog && Object.hasOwn(catalog, message)
    ? catalog[message]
    : message
  if (!values.length) return text
  return text.replace(/\{(\d+)\}/g, (match, index: string) => Number(index) < values.length ? String(values[Number(index)]) : match)
}
