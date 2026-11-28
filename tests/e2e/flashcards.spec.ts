import { test, expect } from './support/fixtures.ts'
import { card, state } from './support/data.ts'

test('empty deck and empty review explain how to get started', async ({ page }) => {
  await page.goto('/flashcards')
  await expect(page.getByText('Your deck is empty.', { exact: false })).toBeVisible()
  await page.goto('/review')
  await expect(page.getByRole('heading', { name: 'No flashcards due' })).toBeVisible()
})

test('searches, filters, expands and deletes cards with persistence', async ({ page, app }) => {
  const saved = state()
  saved.flashcards = [card('due'), { ...card('future', Date.now() + 86_400_000), lapses: 2 }]
  await app.seed(saved)
  await page.goto('/flashcards')
  await page.getByRole('radio', { name: 'Due for review', exact: true }).click()
  await expect(page.getByRole('button', { name: /Question due/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Question future/ })).toHaveCount(0)
  await page.getByRole('radio', { name: 'Hard', exact: true }).click()
  await expect(page.getByRole('button', { name: /Question future/ })).toBeVisible()
  await page.getByRole('radio', { name: 'All', exact: true }).click()
  await page.getByRole('textbox', { name: 'Search flashcards' }).fill('not present')
  await expect(page.getByText('No flashcards match this filter.')).toBeVisible()
  await page.getByRole('textbox', { name: 'Search flashcards' }).fill('future')
  await page.getByRole('button', { name: /Question future/ }).click()
  await expect(page.getByText('Answer future', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect.poll(async () => (await app.saved()).flashcards.map((card) => card.id)).toEqual(['due'])
  await page.reload()
  await expect(page.getByRole('button', { name: /Question due/ })).toBeVisible()
})

for (const [rating, key, interval] of [['Hard', '2', 0], ['Good', '3', 1], ['Easy', '4', 4]] as const) {
  test(`rates a card ${rating} with keyboard shortcuts and saves its schedule`, async ({ page, app }) => {
    const saved = state()
    saved.flashcards = [card('one')]
    await app.seed(saved)
    await page.goto('/review')
    await expect(page.getByText('Question one', { exact: true })).toBeVisible()
    await page.keyboard.press('Space')
    await expect(page.getByText('Answer one', { exact: true })).toBeVisible()
    await page.keyboard.press(key)
    await expect(page.getByRole('heading', { name: 'Review complete!' })).toBeVisible()
    await expect.poll(async () => (await app.saved()).flashcards[0].reps).toBe(1)
    expect((await app.saved()).flashcards[0]).toMatchObject({ interval, lapses: 0 })
    expect((await app.saved()).flashcards[0].due).toBeGreaterThan(Date.now())
    await page.reload()
    await expect(page.getByRole('heading', { name: 'No flashcards due' })).toBeVisible()
  })
}

test('Again returns a forgotten card to the queue before completing review', async ({ page, app }) => {
  const saved = state()
  saved.flashcards = [card('one')]
  await app.seed(saved)
  await page.goto('/review')
  await page.getByRole('button', { name: 'Show answer' }).click()
  await page.getByRole('button', { name: /Again/ }).click()
  await expect(page.getByRole('button', { name: 'Show answer' })).toBeVisible()
  await page.getByRole('button', { name: 'Show answer' }).click()
  await page.getByRole('button', { name: /Good/ }).click()
  await expect(page.getByRole('heading', { name: 'Review complete!' })).toBeVisible()
  await expect.poll(async () => (await app.saved()).flashcards[0].lapses).toBe(1)
})

test('practice all includes cards that are not yet due', async ({ page, app }) => {
  const saved = state()
  saved.flashcards = [card('future', Date.now() + 86_400_000)]
  await app.seed(saved)
  await page.goto('/flashcards')
  await page.getByRole('link', { name: 'Practice all', exact: true }).click()
  await expect(page).toHaveURL(/\/review\?all=1$/)
  await expect(page.getByText('Question future', { exact: true })).toBeVisible()
})
