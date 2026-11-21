import { readFile } from 'node:fs/promises'

import { expect, type Page, test } from '@playwright/test'

import { expectNoAxeViolations, secondUser, seedUser, signInAs } from './helpers'

const openSettings = async (page: Page) => {
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Settings' })
    .click()
  await expect(page.getByRole('heading', { name: 'Sync' })).toBeVisible()
}

const localDatabases = (page: Page): Promise<string[]> =>
  page.evaluate(async () => (await indexedDB.databases()).flatMap((db) => db.name ?? []))

const dbName = (user: { id: string }) => `calorithm-${user.id}`

const signOutButton = (page: Page) => page.getByRole('button', { name: 'Sign out', exact: true })
const signInButton = (page: Page) => page.getByRole('button', { name: 'Sign in' })

// Sync case 14.
test('sign-out deletes the local database', async ({ page }) => {
  await signInAs(page, seedUser)
  await openSettings(page)
  await expect(page.getByText('Everything is synced')).toBeVisible({ timeout: 15_000 })
  expect(await localDatabases(page)).toContain(dbName(seedUser))

  await signOutButton(page).click()

  await expect(signInButton(page)).toBeVisible()
  expect(await localDatabases(page)).not.toContain(dbName(seedUser))
})

// Another tab holds the database open; the delete must still go through.
test('sign-out deletes the database while another tab has it open', async ({ page }) => {
  await signInAs(page, seedUser)
  await openSettings(page)
  await expect(page.getByText('Everything is synced')).toBeVisible({ timeout: 15_000 })
  const otherTab = await page.context().newPage()
  await otherTab.goto('./#/settings')
  await expect(otherTab.getByText('Everything is synced')).toBeVisible({ timeout: 15_000 })

  await signOutButton(page).click()

  await expect(signInButton(page)).toBeVisible()
  expect(await localDatabases(page)).not.toContain(dbName(seedUser))
  await expect(signInButton(otherTab)).toBeVisible()
})

// Sync case 17.
test('a second user on the same device gets only their own database', async ({ page }) => {
  await signInAs(page, seedUser)
  await openSettings(page)
  await expect(page.getByText('Everything is synced')).toBeVisible({ timeout: 15_000 })
  await signOutButton(page).click()
  await expect(signInButton(page)).toBeVisible()

  await signInAs(page, secondUser)
  await openSettings(page)
  await expect(page.getByText('second.user@calorithm.test')).toBeVisible()

  const names = (await localDatabases(page)).filter((name) => name.startsWith('calorithm-'))
  expect(names).toEqual([dbName(secondUser)])
})

test.describe('unsent changes at sign-out', () => {
  // These change the second user's profile; the phone project would race on the same row.
  test.skip(({ isMobile }) => isMobile, 'Runs in the desktop project only')
  test.describe.configure({ mode: 'serial' })

  // Signs in as the second user, goes offline, and changes units, leaving one unsent change.
  const leaveUnsentChange = async (page: Page) => {
    await signInAs(page, secondUser)
    await openSettings(page)
    await expect(page.getByText('Everything is synced')).toBeVisible({ timeout: 15_000 })
    const current = (await page.getByRole('radio', { name: 'Metric (kg)' }).isChecked())
      ? 'Metric (kg)'
      : 'Imperial (lb)'
    const other = current === 'Metric (kg)' ? 'Imperial (lb)' : 'Metric (kg)'
    // Units can't change offline until the profile exists on this device, so one change
    // goes out online first.
    await page.getByRole('radio', { name: other }).check()
    await expect(page.getByText('1 change waiting to sync')).toBeVisible()
    await expect(page.getByText('Everything is synced')).toBeVisible({ timeout: 15_000 })
    await page.context().setOffline(true)
    await page.getByRole('radio', { name: current }).check()
    await expect(page.getByText('1 change waiting to sync')).toBeVisible()
  }

  const warning = (page: Page) =>
    page.getByRole('dialog', { name: 'Sign out and lose unsent changes?' })

  // Sync case 15.
  test('warns, exports, and keeps everything on cancel', async ({ page }) => {
    await leaveUnsentChange(page)

    await signOutButton(page).click()
    await expect(warning(page)).toBeVisible()
    await expect(warning(page)).toContainText('1 change hasn’t reached the server')

    const downloading = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export changes' }).click()
    const download = await downloading
    expect(download.suggestedFilename()).toMatch(
      /^calorithm-unsent-changes-\d{4}-\d{2}-\d{2}\.json$/,
    )
    const file = JSON.parse(await readFile(await download.path(), 'utf8'))
    expect(file).toMatchObject({ format: 'calorithm-unsent-changes', version: 1 })
    expect(file.changes).toEqual([
      expect.objectContaining({
        table: 'profile',
        row: expect.objectContaining({ id: secondUser.id }),
      }),
    ])

    await page.keyboard.press('Escape')
    await expect(warning(page)).toHaveCount(0)
    expect(await localDatabases(page)).toContain(dbName(secondUser))

    await page.context().setOffline(false)
    await expect(page.getByText('Everything is synced')).toBeVisible({ timeout: 15_000 })
  })

  test('deletes the unsent change when signing out anyway', async ({ page }) => {
    await leaveUnsentChange(page)

    await signOutButton(page).click()
    await page.getByRole('button', { name: 'Sign out anyway' }).click()

    await expect(signInButton(page)).toBeVisible()
    expect(await localDatabases(page)).not.toContain(dbName(secondUser))
  })

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`the warning has no axe violations in the ${colorScheme} theme`, async ({ page }) => {
      await page.emulateMedia({ colorScheme })
      await leaveUnsentChange(page)

      await signOutButton(page).click()
      await expect(warning(page)).toBeVisible()
      await expectNoAxeViolations(page)

      await page.getByRole('button', { name: 'Cancel' }).click()
      await page.context().setOffline(false)
      await expect(page.getByText('Everything is synced')).toBeVisible({ timeout: 15_000 })
    })
  }
})
