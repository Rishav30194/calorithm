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

// Weight tests only; its units stay metric, since other tests flip the seed user's units.
export const weightUser = {
  id: 'd0000000-0000-4000-8000-000000000003',
  email: 'weight.user@calorithm.test',
  password: 'Local-Seed-Pass-2026',
}

// The units switch test only, in the desktop project.
export const unitsUser = {
  id: 'd0000000-0000-4000-8000-000000000004',
  email: 'units.user@calorithm.test',
  password: 'Local-Seed-Pass-2026',
}

// The profile form test only, in the desktop project; other projects only read its profile.
export const profileUser = {
  id: 'd0000000-0000-4000-8000-000000000005',
  email: 'profile.user@calorithm.test',
  password: 'Local-Seed-Pass-2026',
}

// The check-in tests only, in the desktop project; its check-ins pile up between local runs.
export const checkinUser = {
  id: 'd0000000-0000-4000-8000-000000000006',
  email: 'checkin.user@calorithm.test',
  password: 'Local-Seed-Pass-2026',
}

// Receives imports in the backup tests; its data piles up between local runs.
export const importUser = {
  id: 'd0000000-0000-4000-8000-000000000007',
  email: 'import.user@calorithm.test',
  password: 'Local-Seed-Pass-2026',
}

// The account deletion test only, in the desktop project: it deletes this user, and
// e2e/database.ts puts it back before each run.
export const deleteMeUser = {
  id: 'd0000000-0000-4000-8000-000000000008',
  email: 'delete.me@calorithm.test',
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
