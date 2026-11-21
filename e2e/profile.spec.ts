import { expect, type Page, test } from '@playwright/test'

import { expectNoAxeViolations, profileUser, signInAs } from './helpers'

const openSettings = async (page: Page) => {
  await signInAs(page, profileUser)
  await page.goto('./#/settings')
  await expect(page.getByRole('heading', { name: 'Profile', level: 2 })).toBeVisible()
}

// Waits until the outbox is empty, so the saved profile reaches the server before the test ends.
const waitForSync = async (page: Page) => {
  await expect
    .poll(
      () =>
        page.evaluate(
          (name) =>
            new Promise<number>((resolve, reject) => {
              const open = indexedDB.open(name)
              open.onerror = () => reject(open.error)
              open.onsuccess = () => {
                const count = open.result.transaction('outbox').objectStore('outbox').count()
                count.onsuccess = () => {
                  resolve(count.result)
                  open.result.close()
                }
                count.onerror = () => reject(count.error)
              }
            }),
          `calorithm-${profileUser.id}`,
        ),
      { timeout: 15_000 },
    )
    .toBe(0)
}

test.describe('the profile form', () => {
  // Writes the profile user's one profile row, so it runs in one project only.
  test.skip(({ isMobile }) => isMobile, 'Runs in the desktop project only')

  test('saves every setting, and keeps them across a reload', async ({ page }) => {
    // A random floor, so a value left by an earlier run can't make the test pass.
    const floor = String(1000 + Math.floor(Math.random() * 2000))
    await openSettings(page)

    await page.getByLabel('Height (cm)').fill('172.5')
    await page.getByLabel('Birth date').fill('1990-04-12')
    await page.getByRole('radio', { name: 'Female' }).check()
    await page.getByRole('radio', { name: /^Light/ }).check()
    await page.getByRole('radio', { name: 'Lose weight' }).check()
    await page.getByLabel('Amount a week (kg)').fill('0.4')
    await page.getByLabel('Protein (g per kg of body weight)').selectOption('2')
    await page.getByLabel('Calorie floor (kcal)').fill(floor)
    await page.getByRole('button', { name: 'Save profile' }).click()
    await expect(page.getByRole('main').getByRole('status')).toHaveText('Saved.')
    await waitForSync(page)

    await page.reload()
    await expect(page.getByLabel('Height (cm)')).toHaveValue('172.5')
    await expect(page.getByLabel('Birth date')).toHaveValue('1990-04-12')
    await expect(page.getByRole('radio', { name: 'Female' })).toBeChecked()
    await expect(page.getByRole('radio', { name: /^Light/ })).toBeChecked()
    await expect(page.getByRole('radio', { name: 'Lose weight' })).toBeChecked()
    await expect(page.getByLabel('Amount a week (kg)')).toHaveValue('0.4')
    await expect(page.getByLabel('Protein (g per kg of body weight)')).toHaveValue('2')
    await expect(page.getByLabel('Calorie floor (kcal)')).toHaveValue(floor)
  })

  test('a new device shows the saved profile, not defaults', async ({ page, browser }) => {
    const floor = String(1000 + Math.floor(Math.random() * 2000))
    await openSettings(page)
    await page.getByLabel('Calorie floor (kcal)').fill(floor)
    await page.getByRole('button', { name: 'Save profile' }).click()
    await expect(page.getByRole('main').getByRole('status')).toHaveText('Saved.')
    await waitForSync(page)

    // A fresh context has no local database, like a second device.
    const other = await browser.newContext()
    const fresh = await other.newPage()
    await openSettings(fresh)
    await expect(fresh.getByLabel('Calorie floor (kcal)')).toHaveValue(floor)
    await other.close()
  })

  test('names a value the database would refuse, and saves nothing', async ({ page }) => {
    await openSettings(page)
    await page.getByLabel('Calorie floor (kcal)').fill('800')
    await page.getByRole('button', { name: 'Save profile' }).click()
    await expect(page.getByText('Enter a whole number from 1000 to 3000.')).toBeVisible()
    await expect(page.getByRole('main').getByRole('status')).toHaveText('')
  })
})

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`the settings screen in the ${colorScheme} theme`, () => {
    test.use({ colorScheme })

    test('has no axe violations, with the form’s errors showing', async ({ page }) => {
      await openSettings(page)
      await expectNoAxeViolations(page)
      await page.getByLabel('Height (cm)').fill('20')
      await page.getByRole('button', { name: 'Save profile' }).click()
      await expect(page.getByText('Enter a height from 100 to 250 cm.')).toBeVisible()
      await expectNoAxeViolations(page)
    })
  })
}
