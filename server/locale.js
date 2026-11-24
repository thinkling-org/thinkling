import { AsyncLocalStorage } from 'node:async_hooks'
import { normalizeLocale, preferredLocale } from '../src/lib/languages.js'
import { translate } from '../src/lib/translation.js'
import { readState, writeState } from './store.js'

const requestLocale = new AsyncLocalStorage()

export function runWithRequestLocale(req, next) {
  requestLocale.run(localeForRequest(req), next)
}

export function t(message, values) {
  return translate(requestLocale.getStore() || readState().settings.locale, message, values)
}

export function localeForRequest(req) {
  const preferred = req.app.locals.systemLanguages?.length
    ? req.app.locals.systemLanguages
    : req.acceptsLanguages()
  return normalizeLocale(readState().settings.locale) || preferredLocale(preferred || [])
}

export function initializeLocale(req) {
  const state = readState()
  const locale = localeForRequest(req)
  if (state.settings.locale === locale) return state
  return writeState({ ...state, settings: { ...state.settings, locale } })
}
