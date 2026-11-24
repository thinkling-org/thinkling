import { t } from './i18n.ts'
import type { TestRun } from '../domain.ts'
export const RUNNABLE = ['javascript', 'typescript']

export function allTestsPassed(run: TestRun | null | undefined) {
  return Boolean(run && !run.compileError && run.results.length > 0 && run.results.every((result) => result.ok))
}

export async function runTests({ code, tests, language }: { code: string; tests: string; language: string }): Promise<TestRun> {
  let js = code
  if (language === 'typescript') {
    try {
      const { transpileTypeScript } = await import('./monaco.ts')
      js = await transpileTypeScript(code)
    } catch (err) {
      return { results: [], logs: [], compileError: `TypeScript: ${err.message}` }
    }
  }
  return new Promise((resolve) => {
    const worker = new Worker(new URL('./runner.worker.ts', import.meta.url), { type: 'module' })
    const timer = setTimeout(() => {
      worker.terminate()
      resolve({ results: [], logs: [], compileError: t('The 10 s limit expired. Check for an infinite loop.'), timedOut: true })
    }, 10_000)
    worker.onmessage = (e) => {
      clearTimeout(timer)
      worker.terminate()
      resolve(e.data)
    }
    worker.onerror = (e) => {
      clearTimeout(timer)
      worker.terminate()
      resolve({ results: [], logs: [], compileError: e.message || t('Worker error') })
    }
    worker.postMessage({ code: js, tests })
  })
}
