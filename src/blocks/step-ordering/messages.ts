import { createTranslator } from '../../lib/i18n.ts'
import pl from './locales/pl.ts'

/** This block's translations, also handed to the host for ctx.t. */
export const catalogs = { pl }

/** Translates this block's own messages. */
export const t = createTranslator(catalogs)
