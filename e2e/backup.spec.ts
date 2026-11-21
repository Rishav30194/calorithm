import { readFile } from 'node:fs/promises'

import { expect, type Page, test } from '@playwright/test'

import { expectNoAxeViolations, importUser, seedUser, signInAs } from './helpers'

// Rows stay in the local database between runs, so every name is unique to its test run.
const unique = (name: string) =>
  `${name} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

const openSettings = async (page: Page) => {
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Settings' })
    .click()
  await expect(page.getByRole('heading', { name: 'Your data' })).toBeVisible()
}

const yourData = (page: Page) => page.getByRole('region', { name: 'Your data' })

const openFoods = async (page: Page) => {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Log' }).click()
  await page
    .getByRole('navigation', { name: 'Foods and recipes' })
    .getByRole('link', { name: 'Foods' })
    .click()
  await expect(page.getByRole('heading', { name: 'Foods', level: 2 })).toBeVisible()
}

const addFood = async (page: Page, name: string) => {
  await openFoods(page)
  await page.getByRole('link', { name: 'Add food' }).click()
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Serving size').fill('40')
  await page.getByLabel('Serving unit').fill('g')
  await page.getByLabel('kcal per serving').fill('150')
  await page.getByLabel('Protein per serving (g)').fill('5')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('heading', { name: 'Foods', level: 2 })).toBeVisible()
}

const exportData = async (page: Page): Promise<string> => {
  const download = page.waitForEvent('download')
  await yourData(page).getByRole('button', { name: 'Export data' }).click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/^calorithm-export-\d{4}-\d{2}-\d{2}\.json$/)
  return file.path()
}

const newerVersion = {
  name: 'newer.json',
  mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify({ format: 'calorithm-export', version: 99 })),
}

test('an export imported into another account brings its data across (phase 6 criterion)', async ({
  page,
  browser,
}) => {
  const name = unique('Exported oats')
  await signInAs(page, seedUser)
  await addFood(page, name)
  await openSettings(page)
  const path = await exportData(page)

  const file = JSON.parse(await readFile(path, 'utf8'))
  expect(file).toMatchObject({ format: 'calorithm-export', version: 1, user_id: seedUser.id })
  expect(file.tables.foods.map((food: { name: string }) => food.name)).toContain(name)
  await expect(yourData(page).getByRole('status')).toContainText('Exported.')
  await expect(yourData(page).getByText(/^Last exported on this device:/)).toBeVisible()

  const context = await browser.newContext()
  const other = await context.newPage()
  await signInAs(other, importUser)
  await openSettings(other)
  await yourData(other).getByLabel('Export file to import').setInputFiles(path)
  await other
    .getByRole('dialog', { name: 'Import this file?' })
    .getByRole('button', { name: 'Import' })
    .click()
  await expect(yourData(other).getByRole('status')).toContainText('Imported.')
  await expect(other.getByText('Everything is synced')).toBeVisible({ timeout: 30_000 })

  await openFoods(other)
  await other.getByLabel('Search foods').fill(name)
  await expect(other.getByRole('link', { name: new RegExp(name) })).toContainText(
    '40 g · 150 kcal · 5 g protein',
  )
  await context.close()
})

test('a file from a newer version is refused and imports nothing (phase 6 criterion)', async ({
  page,
}) => {
  await signInAs(page, importUser)
  await openSettings(page)
  await yourData(page).getByLabel('Export file to import').setInputFiles(newerVersion)

  await expect(yourData(page).getByRole('alert')).toHaveText(
    'This file comes from a newer version of Calorithm. Update the app, then try again.',
  )
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`your data in the ${colorScheme} theme`, () => {
    test.use({ colorScheme })

    test('has no axe violations, nor does the import confirmation', async ({ page }) => {
      await signInAs(page, importUser)
      await openSettings(page)
      const path = await exportData(page)
      await expect(yourData(page).getByRole('status')).toContainText('Exported.')
      await expectNoAxeViolations(page)

      await yourData(page).getByLabel('Export file to import').setInputFiles(path)
      await expect(page.getByRole('dialog', { name: 'Import this file?' })).toBeVisible()
      await expectNoAxeViolations(page)
    })
  })
}

// A local calendar day, days before today, as the weight form takes it.
const daysAgo = (days: number): string => {
  const day = new Date()
  day.setDate(day.getDate() - days)
  return [day.getFullYear(), day.getMonth() + 1, day.getDate()]
    .map((part) => String(part).padStart(2, '0'))
    .join('-')
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`the export reminder in the ${colorScheme} theme`, () => {
    test.use({ colorScheme })

    // Each test starts on a new device, which has never exported.
    test('shows on the check-in screen with old data, with no axe violations', async ({ page }) => {
      await signInAs(page, importUser)
      await page
        .getByRole('navigation', { name: 'Main' })
        .getByRole('link', { name: 'Weight' })
        .click()
      await page.getByLabel('Day').fill(daysAgo(40))
      await page.getByLabel(/^Weight \(/).fill('82')
      await page.getByRole('button', { name: 'Save' }).click()
      await expect(page.getByText(/^Saved\./)).toBeVisible()

      await page
        .getByRole('navigation', { name: 'Main' })
        .getByRole('link', { name: 'Check-in' })
        .click()
      const reminder = page.getByRole('complementary', { name: 'Your data' })
      await expect(reminder).toContainText('You haven’t exported your data from this device yet.')
      await expectNoAxeViolations(page)

      await reminder.getByRole('link', { name: 'Export in Settings' }).click()
      await expect(page.getByRole('heading', { name: 'Your data' })).toBeVisible()
    })
  })
}
