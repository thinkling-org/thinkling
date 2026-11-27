import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { zipSync } from 'fflate'
import { test, expect } from './support/fixtures.ts'

async function exampleArchive() {
  const root = fileURLToPath(new URL('../../examples/plugins/number-line/', import.meta.url))
  const entries = await readdir(root, { recursive: true, withFileTypes: true })
  const files: Record<string, Uint8Array> = {}
  for (const entry of entries) {
    if (!entry.isFile()) continue
    const absolute = join(entry.parentPath, entry.name)
    files[absolute.slice(root.length).replaceAll('\\', '/')] = await readFile(absolute)
  }
  return Buffer.from(zipSync(files))
}

test('installs, loads, disables, reenables and removes an extension', async ({ page }) => {
  await page.goto('/extensions')
  await expect(page.getByText('No extensions installed yet.')).toBeVisible()
  await page.locator('input[type=file]').setInputFiles({ name: 'number-line.thinkling', mimeType: 'application/zip', buffer: await exampleArchive() })
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.getByRole('button', { name: 'I trust it, install' }).click()
  await expect(page.getByRole('heading', { name: 'Number line', exact: true })).toBeVisible()
  const enabled = page.getByRole('checkbox', { name: 'Use in lessons' })
  await expect(enabled).toBeChecked()
  await enabled.uncheck()
  await expect(enabled).toBeEnabled()
  await page.reload()
  await expect(enabled).not.toBeChecked()
  await enabled.check()
  await expect(enabled).toBeEnabled()
  await page.getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Number line', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Click again to remove', exact: true }).click()
  await expect(page.getByText('No extensions installed yet.')).toBeVisible()
  await page.reload()
  await expect(page.getByText('No extensions installed yet.')).toBeVisible()
})

test('rejects unsupported and corrupt extension files and can cancel installation', async ({ page }) => {
  await page.goto('/extensions')
  const input = page.locator('input[type=file]')
  await input.setInputFiles({ name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from('invalid') })
  await expect(page.getByRole('status')).toContainText('Choose a .thinkling file.')
  await input.setInputFiles({ name: 'corrupt.thinkling', mimeType: 'application/zip', buffer: Buffer.from('invalid') })
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await input.setInputFiles({ name: 'corrupt.thinkling', mimeType: 'application/zip', buffer: Buffer.from('invalid') })
  await page.getByRole('button', { name: 'I trust it, install' }).click()
  await expect(page.getByRole('status')).toContainText('This file is not a valid Thinkling extension.')
})
