import { type Browser, expect, type Page, test } from '@playwright/test'

import { signIn } from './helpers'

// The phone project skips this file (playwright.config.ts): both tests change the seed
// user's profile, and the two projects run in parallel.
test.describe.configure({ mode: 'serial' })

const openSettings = async (page: Page) => {
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Settings' })
    .click()
  await expect(page.getByRole('heading', { name: 'Sync' })).toBeVisible()
}

const newDevice = async (browser: Browser) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  await signIn(page)
  await openSettings(page)
  return { context, page }
}

// The unit the profile doesn't use yet, so every run makes a real change.
const otherUnit = async (page: Page): Promise<'Metric (kg)' | 'Imperial (lb)'> =>
  (await page.getByRole('radio', { name: 'Metric (kg)' }).isChecked())
    ? 'Imperial (lb)'
    : 'Metric (kg)'

test('a change on one device reaches another', async ({ browser }) => {
  const phone = await newDevice(browser)
  const laptop = await newDevice(browser)
  const unit = await otherUnit(phone.page)

  await phone.page.getByRole('radio', { name: unit }).check()
  // Wait for the change to queue and then go out; "Everything is synced" alone was already
  // showing from the first sync.
  await expect(phone.page.getByText('1 change waiting to sync')).toBeVisible()
  await expect(phone.page.getByText('Everything is synced')).toBeVisible({ timeout: 15_000 })

  // The laptop picks it up when it comes back to the foreground, as after switching apps.
  await laptop.page.reload()
  await openSettings(laptop.page)
  await expect(laptop.page.getByRole('radio', { name: unit })).toBeChecked({ timeout: 15_000 })

  await phone.context.close()
  await laptop.context.close()
})

// Sync case 1.
test('a change made offline reaches the server once the connection returns', async ({
  browser,
}) => {
  const phone = await newDevice(browser)
  const unit = await otherUnit(phone.page)

  await phone.context.setOffline(true)
  await phone.page.getByRole('radio', { name: unit }).check()
  await expect(phone.page.getByRole('banner').getByRole('status')).toHaveText(
    'Offline · 1 waiting',
    {
      timeout: 15_000,
    },
  )
  await expect(phone.page.getByText('1 change waiting to sync')).toBeVisible()

  await phone.context.setOffline(false)
  await expect(phone.page.getByText('Everything is synced')).toBeVisible({ timeout: 15_000 })
  await expect(phone.page.getByRole('banner').getByRole('status')).toHaveCount(0)

  const laptop = await newDevice(browser)
  await expect(laptop.page.getByRole('radio', { name: unit })).toBeChecked({ timeout: 15_000 })

  await phone.context.close()
  await laptop.context.close()
})
