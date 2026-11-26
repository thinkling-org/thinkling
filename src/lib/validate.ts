// Verify generated tests against the reference solution and starter code.
// The reference must pass every test and the starter must fail at least one. Request one repair on failure.
import { allTestsPassed, RUNNABLE, runTests } from './runner.ts'
import { ai } from './api.ts'
import { sandbox, mergeFiles } from './sandbox.ts'
import type { Exercise, TestRun } from '../domain.ts'

type Stage = (stage: 'validating' | 'building' | 'fixing', detail?: string) => void
interface Verification {
  status: 'verified' | 'unverified' | 'review-only'
  patch?: Partial<Exercise>
  fixed?: boolean
  total?: number
  note?: string
}
type Repair = Partial<Exercise> & { note?: string }

interface VerificationRuns {
  solutionRun: TestRun
  starterRun: TestRun
}

/** Runtime-specific execution and repair; the verification policy is shared. */
interface VerificationAdapter<Patch extends Partial<Exercise>> {
  run(patch: Patch): Promise<VerificationRuns>
  repair(patch: Patch, runs: VerificationRuns): Promise<{ patch: Patch; note: string }>
  afterRepair?(): void
}

export async function verifyExercise(exercise: Exercise, planLanguage?: string, { onStage }: { onStage?: Stage } = {}): Promise<Verification> {
  if (exercise.runtime === 'docker') return verifyDocker(exercise, String(planLanguage || exercise.codeLanguage).toLowerCase(), onStage)
  if (exercise.runtime === 'review') return { status: 'review-only' }
  const language = String(exercise.codeLanguage || planLanguage || 'javascript').toLowerCase()
  if (!RUNNABLE.includes(language)) return { status: 'review-only' }

  return verifyBrowser(exercise, language, onStage)
}

async function verifyWithRepair<Patch extends Partial<Exercise>>(
  initial: Patch,
  adapter: VerificationAdapter<Patch>,
  onStage?: Stage,
): Promise<Verification> {
  let current = initial
  let note = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    let runs: VerificationRuns
    try {
      runs = await adapter.run(current)
    } catch (err: unknown) {
      return { status: 'unverified', note: err instanceof Error ? err.message : String(err) }
    }

    const { solutionRun, starterRun } = runs
    const ok = allTestsPassed(solutionRun) && failsSomething(starterRun)
    const patch = attempt > 0 ? current : undefined
    if (ok) return { status: 'verified', patch, fixed: attempt > 0, total: solutionRun.results.length, note }
    if (attempt === 1) return { status: 'unverified', patch, note }

    onStage?.('fixing')
    try {
      const repaired = await adapter.repair(current, runs)
      current = repaired.patch
      note = repaired.note
    } catch {
      return { status: 'unverified' }
    }
    adapter.afterRepair?.()
  }
  return { status: 'unverified' }
}

const failsSomething = (run: TestRun) => !!run && !run.timedOut && (!!run.compileError || run.results.some((r) => !r.ok))

async function verifyBrowser(exercise: Exercise, language: string, onStage?: Stage): Promise<Verification> {
  const initial = { tests: exercise.tests, solution: exercise.solution, starterCode: exercise.starterCode }
  return verifyWithRepair(initial, {
    async run(current) {
      const solutionRun = await runTests({ code: current.solution, tests: current.tests, language })
      const starterRun = await runTests({ code: current.starterCode, tests: current.tests, language })
      return { solutionRun, starterRun }
    },
    async repair(current, runs) {
      const fix = await ai<Repair>('fixTests', { exercise: { ...exercise, ...current }, language, ...runs })
      return {
        patch: {
          tests: fix.tests?.trim() ? fix.tests : current.tests,
          solution: fix.solution?.trim() ? fix.solution : current.solution,
          starterCode: fix.starterCode?.trim() ? fix.starterCode : current.starterCode,
        },
        note: fix.note || '',
      }
    },
    afterRepair: () => onStage?.('validating'),
  }, onStage)
}

async function verifyDocker(exercise: Exercise, language: string, onStage?: Stage): Promise<Verification> {
  const initial = { files: exercise.files, testFiles: exercise.testFiles, solutionFiles: exercise.solutionFiles, testCommand: exercise.testCommand }
  return verifyWithRepair(initial, {
    async run(current) {
      onStage?.('validating')
      const solutionRun = await sandbox.verify(
        { language, files: mergeFiles(current.files, current.solutionFiles, current.testFiles), testCommand: current.testCommand },
        (message) => onStage?.('building', message),
      )
      onStage?.('validating')
      const starterRun = await sandbox.verify({ language, files: mergeFiles(current.files, current.testFiles), testCommand: current.testCommand })
      return { solutionRun, starterRun }
    },
    async repair(current, runs) {
      const fix = await ai<Repair>('fixTests', { exercise: { ...exercise, ...current }, language, ...runs, runtime: 'docker' })
      return {
        patch: {
          files: fix.files?.length ? fix.files : current.files,
          testFiles: fix.testFiles?.length ? fix.testFiles : current.testFiles,
          solutionFiles: fix.solutionFiles?.length ? fix.solutionFiles : current.solutionFiles,
          testCommand: fix.testCommand?.trim() || current.testCommand,
        },
        note: fix.note || '',
      }
    },
  }, onStage)
}
