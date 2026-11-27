import { test, expect } from './support/fixtures.ts'
import { learningState, state } from './support/data.ts'

test('first run completes the wizard without installing optional tools', async ({ page, app }) => {
  const saved = state()
  saved.settings.setupDone = false
  await app.seed(saved)
  await page.goto('/')
  await expect(page).toHaveURL(/\/setup$/)
  await expect(page.getByRole('heading', { name: 'Welcome to Thinkling!' })).toBeVisible()
  await page.getByRole('button', { name: 'Set up AI' }).click()
  await expect(page.getByRole('heading', { name: 'AI provider', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Test connection' }).click()
  await expect(page.getByRole('status')).toContainText('E2E connection ready')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Docker', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Not now', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Dictation', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: 'Continue to learning' }).click()
  await expect(page).toHaveURL(/\/start$/)
  expect((await app.saved()).settings.setupDone).toBe(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'What do you want to learn?' })).toBeVisible()
})

for (const path of ['/path', '/plan', '/lesson/missing']) {
  test(`requires a plan for ${path}`, async ({ page }) => {
    await page.goto(path)
    await expect(page).toHaveURL(/\/start$/)
  })
}

test('unknown routes return to the learning path and locked lessons stay closed', async ({ page, app }) => {
  await app.seed(learningState())
  await page.goto('/unknown-route')
  await expect(page).toHaveURL(/\/path$/)
  await page.getByRole('button', { name: /Function assessment, locked/ }).click()
  await expect(page.getByRole('dialog')).toContainText('Complete earlier lessons')
  await page.goto('/lesson/second')
  await expect(page).toHaveURL(/\/path$/)
  await page.goto('/lesson/missing')
  await expect(page).toHaveURL(/\/path$/)
})

test('language and sound preferences survive reload', async ({ page, app }) => {
  await page.goto('/settings')
  await page.getByRole('button', { name: 'On', exact: true }).click()
  await expect.poll(async () => (await app.saved()).settings.sound).toBe(true)
  await page.getByRole('combobox').selectOption('pl')
  await expect(page.getByRole('heading', { name: 'Ustawienia', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Ustawienia', exact: true })).toBeVisible()
  expect((await app.saved()).settings).toMatchObject({ locale: 'pl', sound: true })
})

test('failed language save restores the previous choice and offers retry', async ({ page }) => {
  await page.goto('/settings')
  await page.route('**/api/state', async (route) => {
    if (route.request().method() === 'PUT') await route.fulfill({ status: 500, json: { error: 'Save unavailable' } })
    else await route.continue()
  })
  await page.getByRole('combobox').selectOption('pl')
  await expect(page.getByRole('alert')).toContainText("Couldn't save the language")
  await expect(page.getByRole('combobox')).toHaveValue('en')
  await page.unroute('**/api/state')
  await page.getByRole('combobox').selectOption('pl')
  await expect(page.getByRole('heading', { name: 'Ustawienia', exact: true })).toBeVisible()
})

test('provider switching remembers independent model and effort preferences', async ({ page, app }) => {
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Sonnet', exact: true }).click()
  await page.getByRole('button', { name: 'High', exact: true }).click()
  await page.getByRole('button', { name: /Codex/ }).first().click()
  await page.getByRole('button', { name: 'E2E Model', exact: true }).click()
  await page.getByRole('button', { name: 'Low', exact: true }).click()
  await page.getByRole('button', { name: 'Test connection' }).click()
  await expect(page.getByRole('status')).toContainText('E2E connection ready')
  await page.getByRole('button', { name: /Claude Code/ }).click()
  await expect(page.getByRole('button', { name: 'Sonnet', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'High', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(async () => (await app.saved()).settings.provider).toBe('claude')
  await page.reload()
  await expect(page.getByRole('button', { name: 'Sonnet', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect((await app.saved()).settings.prefs.codex).toEqual({ model: 'e2e-model', effort: 'low' })
})

test('clearing data can be cancelled and then confirmed', async ({ page, app }) => {
  await app.seed(learningState())
  await page.goto('/settings')
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('button', { name: 'Clear all data' }).click()
  await expect(page).toHaveURL(/\/settings$/)
  expect((await app.saved()).plan).not.toBeNull()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Clear all data' }).click()
  await expect(page).toHaveURL(/\/start$/)
  await expect.poll(async () => (await app.saved()).plan).toBeNull()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'What do you want to learn?' })).toBeVisible()
})

test('sandbox explains unavailable Docker and can recheck', async ({ page }) => {
  await page.goto('/sandbox')
  await expect(page.getByText("Docker isn't running.", { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'check again', exact: true }).click()
  await expect(page.getByText("Docker isn't running.", { exact: true })).toBeVisible()
})
