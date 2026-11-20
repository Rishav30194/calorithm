import { expect, test } from '@playwright/test'

import { expectNoAxeViolations, signIn } from './helpers'

test('a wrong password shows an error and stays on sign-in', async ({ page }) => {
  await signIn(page, 'Not-The-Password-1')

  await expect(page.getByRole('alert')).toContainText('don’t match')
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled()
})

test('signing in shows the shell, tabs navigate, and sign-out returns to sign-in', async ({
  page,
}) => {
  await signIn(page)

  await expect(page.getByRole('heading', { name: 'Log' })).toBeVisible()
  const nav = page.getByRole('navigation', { name: 'Main' })

  await nav.getByRole('link', { name: 'Weight' }).click()
  await expect(page).toHaveURL(/#\/weight$/)
  await expect(page.getByRole('heading', { name: 'Weight' })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Weight' })).toHaveAttribute('aria-current', 'page')

  // A refresh keeps both the screen and the session.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Weight' })).toBeVisible()

  await nav.getByRole('link', { name: 'Settings' }).click()
  await expect(page.getByText('seed.user@calorithm.test')).toBeVisible()
  await page.getByRole('button', { name: 'Sign out' }).click()

  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
})

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`accessibility in the ${colorScheme} theme`, () => {
    test.use({ colorScheme })

    test('the sign-in screen has no axe violations', async ({ page }) => {
      await page.goto('./')
      await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
      await expectNoAxeViolations(page)
    })

    test('the failed sign-in message has no axe violations', async ({ page }) => {
      await signIn(page, 'Not-The-Password-1')
      await expect(page.getByRole('alert')).toBeVisible()
      await expectNoAxeViolations(page)
    })

    test('every shell tab has no axe violations', async ({ page }) => {
      await signIn(page)
      for (const tab of ['Log', 'Weight', 'Check-in', 'Settings']) {
        await page.getByRole('navigation').getByRole('link', { name: tab }).click()
        await expect(page.getByRole('heading', { name: tab })).toBeVisible()
        await expectNoAxeViolations(page)
      }
    })
  })
}
