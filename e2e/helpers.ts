import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

// The synthetic user from supabase/seed.sql.
export const seedUser = {
  email: 'seed.user@calorithm.test',
  password: 'Local-Seed-Pass-2026',
}

export const signIn = async (page: Page, password = seedUser.password) => {
  await page.goto('./')
  await page.getByLabel('Email').fill(seedUser.email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

export const expectNoAxeViolations = async (page: Page) => {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(results.violations).toEqual([])
}
