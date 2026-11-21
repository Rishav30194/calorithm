import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

// The synthetic users from supabase/seed.sql.
export const seedUser = {
  id: 'd0000000-0000-4000-8000-000000000001',
  email: 'seed.user@calorithm.test',
  password: 'Local-Seed-Pass-2026',
}

export const secondUser = {
  id: 'd0000000-0000-4000-8000-000000000002',
  email: 'second.user@calorithm.test',
  password: 'Local-Seed-Pass-2026',
}

type SeedUser = typeof seedUser

export const signIn = (page: Page, password = seedUser.password) =>
  signInAs(page, { ...seedUser, password })

export const signInAs = async (page: Page, user: SeedUser) => {
  await page.goto('./')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

export const expectNoAxeViolations = async (page: Page) => {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(results.violations).toEqual([])
}
