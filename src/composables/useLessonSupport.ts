import { inject, provide, reactive } from 'vue'
import type { InjectionKey } from 'vue'

export type HelpKind = 'hint' | 'syntax' | 'solution' | 'tutor'
interface HelpUsage { hints: number; syntax: boolean; solution: boolean; tutor: boolean }
const EMPTY_USAGE: Readonly<HelpUsage> = Object.freeze({ hints: 0, syntax: false, solution: false, tutor: false })

interface LessonSupport {
  read(id: string): Readonly<HelpUsage>
  mark(id: string, kind: HelpKind): void
  isAssisted(id: string): boolean
  reset(): void
}
const key: InjectionKey<LessonSupport> = Symbol('lesson-support')

export function provideLessonSupport(): LessonSupport {
  const records = reactive<Record<string, HelpUsage>>({})
  const support: LessonSupport = {
    read: (id) => records[id] || EMPTY_USAGE,
    mark(id, kind) {
      const usage = records[id] ||= { ...EMPTY_USAGE }
      if (kind === 'hint') usage.hints++
      else usage[kind] = true
    },
    isAssisted(id) {
      const usage = support.read(id)
      return !!(usage.hints || usage.syntax || usage.solution || usage.tutor)
    },
    reset() { for (const id of Object.keys(records)) delete records[id] },
  }
  provide(key, support)
  return support
}

/** Help tracking is optional in standalone exercise previews. */
export function useLessonSupport() {
  return inject(key, null)
}
