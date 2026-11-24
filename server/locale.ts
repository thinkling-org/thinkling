import { AsyncLocalStorage } from 'node:async_hooks'
import type { NextFunction, Request } from 'express'
import { normalizeLocale, preferredLocale } from '../src/lib/languages.ts'
import { translate } from '../src/lib/translation.ts'
import { readState, writeState } from './store.ts'

const requestLocale = new AsyncLocalStorage<string>()

export function runWithRequestLocale(req: Request, next: NextFunction) {
  requestLocale.run(localeForRequest(req), next)
}

export function t(message: string, values?: readonly unknown[]) {
  return translate(requestLocale.getStore() || readState().settings.locale, message, values)
}

export function localeForRequest(req: Request) {
  const preferred = req.app.locals.systemLanguages?.length
    ? req.app.locals.systemLanguages
    : req.acceptsLanguages()
  return normalizeLocale(readState().settings.locale) || preferredLocale(preferred || [])
}

export function initializeLocale(req: Request) {
  const state = readState()
  const locale = localeForRequest(req)
  if (state.settings.locale === locale) return state
  return writeState({ ...state, settings: { ...state.settings, locale } })
}
