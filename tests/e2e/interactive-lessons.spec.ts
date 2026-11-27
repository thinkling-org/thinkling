import type { Exercise } from '../../src/domain.ts'
import { test, expect } from './support/fixtures.ts'
import { assessment, card, learningState } from './support/data.ts'

function assessmentState(exercises: Exercise[]) {
  const saved = learningState({ ...assessment, exercises })
  saved.plan!.modules[0].lessons[0].kind = 'test'
  return saved
}

for (const correct of [true, false]) {
  test(`interactive ordering grades a ${correct ? 'correct' : 'wrong'} answer without AI`, async ({ page, app }) => {
    const exercise: Exercise = {
      id: 'order', type: 'interactive', stage: 'check', prompt: 'Order the request steps.', explanation: 'Validate before saving.',
      interaction: { type: 'step-ordering', steps: ['Read', 'Validate', 'Save'].map((text) => ({ text, indent: 0 })) },
    }
    await app.seed(assessmentState([exercise]))
    await page.goto('/lesson/first')
    await page.getByRole('button', { name: 'Start assessment' }).click()
    const check = page.getByRole('button', { name: 'Check', exact: true })
    await expect(check).toBeDisabled()
    const bank = page.getByRole('group', { name: 'Blocks to arrange' })
    for (const text of correct ? ['Read', 'Validate', 'Save'] : ['Read', 'Save', 'Validate']) {
      await bank.getByRole('button', { name: text, exact: true }).click()
    }
    await check.click()
    await expect(page.getByText(correct ? 'Great work!' : 'Incorrect', { exact: true })).toBeVisible()
    await expect.poll(async () => (await app.saved()).stats.history.length).toBe(1)
    expect((await app.saved()).stats.history[0].score).toBe(correct ? 1 : 1 / 3)
    expect(await app.calls()).toEqual([])
    await page.getByRole('button', { name: correct ? 'Continue' : 'Got it', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Lesson complete!' })).toBeVisible()
  })
}

test('a cached exercise with a missing extension can be skipped without grading', async ({ page, app }) => {
  await app.seed(assessmentState([{
    id: 'missing', type: 'interactive', stage: 'check', prompt: 'Use the unavailable extension.', interaction: { type: 'example/missing' },
  }]))
  await page.goto('/lesson/first')
  await page.getByRole('button', { name: 'Start assessment' }).click()
  await expect(page.getByRole('note')).toContainText('example/missing')
  await expect(page.getByText('Skipped', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Lesson complete!' })).toBeVisible()
  expect((await app.saved()).stats.history).toEqual([])
})

test('code trace can be generated, stepped through and closed', async ({ page, app }) => {
  const choice = { ...assessment.exercises[0], code: 'const result = 2 * 3;\nconsole.log(result);', codeLanguage: 'javascript' }
  await app.seed(assessmentState([choice]))
  await app.ai({ trace: { data: {
    headline: 'Follow the multiplication.', takeaway: 'The function returns six.', steps: [
      { line: 1, title: 'Compute', say: 'Multiply two by three.', output: [], memory: [{ name: 'result', value: '6', changed: true }] },
      { line: 2, title: 'Print', say: 'Print the result.', output: ['6'], memory: [{ name: 'result', value: '6' }] },
    ],
  } } })
  await page.goto('/lesson/first')
  await page.getByRole('button', { name: 'Start assessment' }).click()
  await page.getByRole('radio', { name: /6/ }).click()
  await page.getByRole('button', { name: 'Check', exact: true }).click()
  await page.locator('summary').filter({ hasText: 'More actions' }).click()
  await page.getByRole('button', { name: 'Trace the code', exact: true }).click()
  await expect(page.getByRole('heading', { name: "Let's trace it together" })).toBeVisible()
  const trace = page.getByRole('region', { name: 'Code trace', exact: true })
  await trace.getByRole('button', { name: 'Next step', exact: true }).click()
  await expect(trace.getByText('The function returns six.', { exact: true })).toBeVisible()
  await trace.getByRole('button', { name: 'Back to the question', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'What is two times three?' })).toBeVisible()
  expect((await app.calls()).map((call) => call.task)).toContain('trace')
})

test('replaying a completed lesson awards only the review bonus and keeps the deck', async ({ page, app }) => {
  const saved = assessmentState([assessment.exercises[0]])
  saved.plan!.modules[0].lessons[0].status = 'done'
  saved.plan!.modules[0].lessons[1].status = 'current'
  saved.stats.xp = 100
  saved.flashcards = [card('existing')]
  await app.seed(saved)
  await page.goto('/path')
  await page.getByRole('button', { name: /Returning values, completed/ }).click()
  await page.getByRole('button', { name: 'Review +5 XP' }).click()
  await page.getByRole('button', { name: 'Start assessment' }).click()
  await page.getByRole('radio', { name: /6/ }).click()
  await page.getByRole('button', { name: 'Check', exact: true }).click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Lesson complete!' })).toBeVisible()
  await expect.poll(async () => (await app.saved()).stats.xp).toBe(115)
  expect((await app.saved()).flashcards.map((card) => card.id)).toEqual(['existing'])
})
