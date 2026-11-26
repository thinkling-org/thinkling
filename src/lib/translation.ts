import polish from '../locales/pl.ts'
import { interfaceLanguage } from './languages.ts'
import type { InterfaceLanguage } from './languages.ts'

export type MessageCatalog = Readonly<Record<string, string>>
/** Translations of English source messages, per interface language. */
export type MessageCatalogs = Partial<Record<InterfaceLanguage, MessageCatalog>>

const appCatalogs: MessageCatalogs = { pl: polish }

export function translate(locale: unknown, message: string, values: readonly unknown[] = []): string {
  return translateWith(appCatalogs, locale, message, values)
}

/** Translate using a module's own catalogs, such as a lesson block's. */
export function translateWith(catalogs: MessageCatalogs, locale: unknown, message: string, values: readonly unknown[] = []): string {
  const catalog = catalogs[interfaceLanguage(locale)]
  const text = catalog && Object.hasOwn(catalog, message)
    ? catalog[message]
    : message
  if (!values.length) return text
  return text.replace(/\{(\d+)\}/g, (match, index: string) => Number(index) < values.length ? String(values[Number(index)]) : match)
}
