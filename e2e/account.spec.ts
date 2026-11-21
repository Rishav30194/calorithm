import { expect, type Page, test } from '@playwright/test'

import { restoreDeleteMeUser, serverRowsOf } from './database'
import { deleteMeUser, expectNoAxeViolations, importUser, signInAs } from './helpers'

const openSettings = async (page: Page) => {
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Settings' })
    .click()
  await expect(page.getByRole('heading', { name: 'Sync' })).toBeVisible()
}

const localDatabases = (page: Page): Promise<string[]> =>
  page.evaluate(async () => (await indexedDB.databases()).flatMap((db) => db.name ?? []))

const deleteDialog = (page: Page) => page.getByRole('dialog', { name: 'Delete your account?' })

test.describe('deleting the account', () => {
  // Both projects would race to delete the same user.
  test.skip(({ isMobile }) => isMobile, 'Runs in the desktop project only')

  test('removes every row from the server and this device (phase 6)', async ({ page }) => {
    restoreDeleteMeUser()
    await signInAs(page, deleteMeUser)
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Weight' })
      .click()
    await page.getByLabel(/^Weight \(/).fill('80')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText(/^Saved\./)).toBeVisible()
    await openSettings(page)
    await expect(page.getByText('Everything is synced')).toBeVisible({ timeout: 15_000 })
    expect(serverRowsOf(deleteMeUser.id)).toBeGreaterThan(1)

    await page.getByRole('button', { name: 'Delete account' }).click()
    await deleteDialog(page).getByLabel('Password').fill('Not-The-Password-1')
    await deleteDialog(page).getByRole('button', { name: 'Delete account' }).click()
    await expect(deleteDialog(page).getByRole('alert')).toHaveText(
      'That password isn’t right. Nothing was deleted.',
    )
    expect(serverRowsOf(deleteMeUser.id)).toBeGreaterThan(1)

    await deleteDialog(page).getByLabel('Password').fill(deleteMeUser.password)
    await deleteDialog(page).getByRole('button', { name: 'Delete account' }).click()

    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible({ timeout: 15_000 })
    expect(serverRowsOf(deleteMeUser.id)).toBe(0)
    expect(await localDatabases(page)).not.toContain(`calorithm-${deleteMeUser.id}`)

    await signInAs(page, deleteMeUser)
    await expect(page.getByRole('alert')).toContainText('don’t match')
  })
})

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`the delete account dialog in the ${colorScheme} theme`, () => {
    test.use({ colorScheme })

    test('has no axe violations, and Cancel deletes nothing', async ({ page }) => {
      await signInAs(page, importUser)
      await openSettings(page)
      await page.getByRole('button', { name: 'Delete account' }).click()
      await expect(deleteDialog(page)).toBeVisible()
      await expectNoAxeViolations(page)

      await deleteDialog(page).getByRole('button', { name: 'Cancel' }).click()
      await expect(deleteDialog(page)).toHaveCount(0)
      await expect(page.getByRole('heading', { name: 'Sync' })).toBeVisible()
    })
  })
}
