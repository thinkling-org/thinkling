// Verify generated tests against the reference solution and starter code.
// The reference must pass every test and the starter must fail at least one. Request one repair on failure.
import { allTestsPassed, RUNNABLE, runTests } from './runner.js'
import { ai } from './api.js'
import { sandbox, mergeFiles } from './sandbox.js'

/** Run the test suite in a container with the solution and the starter files. */
async function verifyDocker(ex, language, onStage) {
  let cur = { files: ex.files, testFiles: ex.testFiles, solutionFiles: ex.solutionFiles, testCommand: ex.testCommand }
  let note = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    let solutionRun, starterRun
    try {
      onStage?.('validating')
      solutionRun = await sandbox.verify(
        { language, files: mergeFiles(cur.files, cur.solutionFiles, cur.testFiles), testCommand: cur.testCommand },
        (m) => onStage?.('building', m),
      )
      onStage?.('validating')
      starterRun = await sandbox.verify({ language, files: mergeFiles(cur.files, cur.testFiles), testCommand: cur.testCommand })
    } catch (err) {
      return { status: 'unverified', note: err.message }
    }
    const ok = allTestsPassed(solutionRun) && failsSomething(starterRun)
    const patch = attempt > 0 ? cur : undefined
    if (ok) return { status: 'verified', patch, fixed: attempt > 0, total: solutionRun.results.length, note }
    if (attempt === 1) return { status: 'unverified', patch, note }
    onStage?.('fixing')
    try {
      const fix = await ai('fixTests', { exercise: { ...ex, ...cur }, language, solutionRun, starterRun, runtime: 'docker' })
      cur = {
        files: fix.files?.length ? fix.files : cur.files,
        testFiles: fix.testFiles?.length ? fix.testFiles : cur.testFiles,
        solutionFiles: fix.solutionFiles?.length ? fix.solutionFiles : cur.solutionFiles,
        testCommand: fix.testCommand?.trim() || cur.testCommand,
      }
      note = fix.note || ''
    } catch {
      return { status: 'unverified' }
    }
  }
  return { status: 'unverified' }
}

const failsSomething = (run) => !!run && (!!run.compileError || run.results.some((r) => !r.ok))

/**
 * @returns {Promise<{status:'verified'|'unverified'|'review-only', patch?:object, fixed?:boolean, total?:number, note?:string}>}
 */
export async function verifyExercise(ex, planLanguage, { onStage } = {}) {
  if (ex.runtime === 'docker') return verifyDocker(ex, String(planLanguage || ex.codeLanguage).toLowerCase(), onStage)
  if (ex.runtime === 'review') return { status: 'review-only' }
  const language = String(ex.codeLanguage || planLanguage || 'javascript').toLowerCase()
  if (!RUNNABLE.includes(language)) return { status: 'review-only' }

  let cur = { tests: ex.tests, solution: ex.solution, starterCode: ex.starterCode }
  let note = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    const solutionRun = await runTests({ code: cur.solution, tests: cur.tests, language })
    const starterRun = await runTests({ code: cur.starterCode, tests: cur.tests, language })
    const ok = allTestsPassed(solutionRun) && failsSomething(starterRun)
    const patch = attempt > 0 ? cur : undefined
    if (ok) return { status: 'verified', patch, fixed: attempt > 0, total: solutionRun.results.length, note }
    if (attempt === 1) return { status: 'unverified', patch, note }

    onStage?.('fixing')
    try {
      const fix = await ai('fixTests', { exercise: { ...ex, ...cur }, language, solutionRun, starterRun })
      cur = {
        tests: fix.tests?.trim() ? fix.tests : cur.tests,
        solution: fix.solution?.trim() ? fix.solution : cur.solution,
        starterCode: fix.starterCode?.trim() ? fix.starterCode : cur.starterCode,
      }
      note = fix.note || ''
    } catch {
      return { status: 'unverified' }
    }
    onStage?.('validating')
  }
  return { status: 'unverified' }
}
