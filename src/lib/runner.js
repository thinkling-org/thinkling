import { t } from './i18n.js'
export const RUNNABLE = ['javascript', 'typescript']

export function allTestsPassed(run) {
  return Boolean(run && !run.compileError && run.results.length > 0 && run.results.every((result) => result.ok))
}

/**
 * @returns {Promise<{results:{name:string,ok:boolean,error?:string,ms:number}[], logs:{level:string,text:string}[], compileError?:string, timedOut?:boolean}>}
 */
export async function runTests({ code, tests, language }) {
  let js = code
  if (language === 'typescript') {
    try {
      const { transpileTypeScript } = await import('./monaco.js')
      js = await transpileTypeScript(code)
    } catch (err) {
      return { results: [], logs: [], compileError: `TypeScript: ${err.message}` }
    }
  }
  return new Promise((resolve) => {
    const worker = new Worker(new URL('./runner.worker.js', import.meta.url), { type: 'module' })
    const timer = setTimeout(() => {
      worker.terminate()
      resolve({ results: [], logs: [], compileError: t('Przekroczono limit 10 s — nieskończona pętla?'), timedOut: true })
    }, 10_000)
    worker.onmessage = (e) => {
      clearTimeout(timer)
      worker.terminate()
      resolve(e.data)
    }
    worker.onerror = (e) => {
      clearTimeout(timer)
      worker.terminate()
      resolve({ results: [], logs: [], compileError: e.message || t('Błąd workera') })
    }
    worker.postMessage({ code: js, tests })
  })
}
