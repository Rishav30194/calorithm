import { expect, type Page, test } from '@playwright/test'

import { expectNoAxeViolations, signIn } from './helpers'

// The local database keeps rows between runs, and the phone and desktop projects share the
// seed user, so each test works on its own far-future day with uniquely named foods.
const unique = (name: string) =>
  `${name} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

const randomDay = (): string => {
  const start = Date.UTC(2090, 0, 1)
  const days = Math.floor(Math.random() * 3_600)
  return new Date(start + days * 86_400_000).toISOString().slice(0, 10)
}

const nextDay = (day: string): string =>
  new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)

const addFood = async (page: Page, name: string, kcal: string) => {
  await page.goto('./#/log/foods/new')
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Serving size').fill('40')
  await page.getByLabel('Serving unit').fill('g')
  await page.getByLabel('kcal per serving').fill(kcal)
  await page.getByLabel('Protein per serving (g)').fill('5')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('heading', { name: 'Foods', level: 2 })).toBeVisible()
}

const openDay = async (page: Page, day: string | null) => {
  await page.goto(day ? `./#/log/day/${day}` : './#/log')
  await expect(page.getByText('Day total')).toBeVisible()
}

const meal = (page: Page, name: string) => page.getByRole('region', { name })

// Adds from the picker's full list, which every saved food is in.
const logFromSearch = async (page: Page, mealName: string, food: string) => {
  await page.getByRole('button', { name: `Add to ${mealName}` }).click()
  const picker = page.getByRole('dialog', { name: `Add to ${mealName}` })
  await picker.getByLabel('Search foods and recipes').fill(food)
  await picker.getByRole('button', { name: new RegExp(food) }).click()
  await expect(picker).toHaveCount(0)
}

test('a saved food is logged in two taps from the log screen (phase 3 criterion)', async ({
  page,
}) => {
  const oats = unique('Oats')
  await signIn(page)
  await addFood(page, oats, '150')
  await openDay(page, null)

  await page.getByRole('button', { name: 'Add to Breakfast' }).click() // Tap 1.
  const picker = page.getByRole('dialog', { name: 'Add to Breakfast' })
  await picker.getByRole('button', { name: new RegExp(oats) }).click() // Tap 2.

  await expect(
    meal(page, 'Breakfast').getByRole('button', { name: new RegExp(oats) }),
  ).toContainText('1 serving · 150 kcal · 5 g protein')
})

test('yesterday’s food is re-logged in one tap, and editing the food leaves the past alone (phase 3 criterion)', async ({
  page,
}) => {
  const oats = unique('Oats')
  const day = randomDay()
  await signIn(page)
  await addFood(page, oats, '150')

  await openDay(page, day)
  await logFromSearch(page, 'Lunch', oats)
  await meal(page, 'Lunch')
    .getByRole('button', { name: new RegExp(oats) })
    .click()
  await page.getByLabel('Servings').fill('2')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Day total').locator('..')).toContainText('300 kcal')

  // The picker's Yesterday section is relative to today, so this uses the day after and its
  // Next day link rather than the device's real yesterday.
  await page.getByRole('link', { name: 'Next day' }).click()
  await expect(page).toHaveURL(new RegExp(nextDay(day)))
  await logFromSearch(page, 'Dinner', oats)
  await expect(meal(page, 'Dinner')).toContainText(oats)

  await page.goto('./#/log/foods')
  await page.getByLabel('Search foods').fill(oats)
  await page.getByRole('link', { name: new RegExp(oats) }).click()
  await page.getByLabel('kcal per serving').fill('400')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('heading', { name: 'Foods', level: 2 })).toBeVisible()

  await openDay(page, day)
  await expect(page.getByText('Day total').locator('..')).toContainText('300 kcal')
  await expect(meal(page, 'Lunch')).toContainText('2 servings · 300 kcal')
})

test('the picker offers yesterday’s foods with the servings last logged', async ({ page }) => {
  const rice = unique('Rice')
  await signIn(page)
  await addFood(page, rice, '270')
  const yesterday = await page.evaluate(() => {
    const now = new Date()
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  })
  await openDay(page, yesterday)
  await logFromSearch(page, 'Dinner', rice)
  await meal(page, 'Dinner')
    .getByRole('button', { name: new RegExp(rice) })
    .click()
  await page.getByLabel('Servings').fill('1.5')
  await page.getByRole('button', { name: 'Save' }).click()

  await openDay(page, null)
  await page.getByRole('button', { name: 'Add to Dinner' }).click()
  const picker = page.getByRole('dialog', { name: 'Add to Dinner' })
  const yesterdaySection = picker.locator('section', {
    has: page.getByRole('heading', { name: 'Yesterday' }),
  })
  await yesterdaySection.getByRole('button', { name: new RegExp(rice) }).click()

  await expect(meal(page, 'Dinner').getByRole('button', { name: new RegExp(rice) })).toContainText(
    '1.5 servings',
  )
})

test('a meal is copied from an earlier day', async ({ page }) => {
  const toast = unique('Toast')
  const egg = unique('Egg')
  const day = randomDay()
  await signIn(page)
  await addFood(page, toast, '80')
  await addFood(page, egg, '70')
  await openDay(page, day)
  await logFromSearch(page, 'Breakfast', toast)
  await logFromSearch(page, 'Breakfast', egg)

  await openDay(page, nextDay(day))
  await page.getByRole('button', { name: 'Copy from… Copy into Breakfast' }).click()
  const dialog = page.getByRole('dialog', { name: 'Copy into Breakfast' })
  await dialog.getByLabel('From date').fill(day)
  await expect(dialog.getByText('2 entries to copy')).toBeVisible()
  await dialog.getByRole('button', { name: 'Copy' }).click()

  await expect(meal(page, 'Breakfast')).toContainText(toast)
  await expect(meal(page, 'Breakfast')).toContainText(egg)
  await expect(page.getByText('Day total').locator('..')).toContainText('150 kcal')
})

test('a day is marked complete and stays so after a reload', async ({ page }) => {
  const day = randomDay()
  await signIn(page)
  await openDay(page, day)

  const complete = page.getByLabel('I logged everything I ate this day')
  await complete.check()
  // Disabled while the local write runs; enabled again once it's stored.
  await expect(complete).toBeEnabled()
  await page.reload()

  await expect(page.getByLabel('I logged everything I ate this day')).toBeChecked()
})

test.describe('a log made at 00:30', () => {
  // Half past midnight in India is still the previous evening in UTC.
  test.use({ timezoneId: 'Asia/Kolkata' })

  test('lands on that calendar day (phase 3 criterion)', async ({ page }) => {
    const late = unique('Late snack')
    // A past moment, so the session from sign-in never looks expired to the fixed clock.
    await page.clock.setFixedTime(new Date('2026-03-14T19:00:00Z'))
    await signIn(page)
    await addFood(page, late, '200')
    await openDay(page, null)
    await expect(page.getByRole('heading', { name: 'Today', level: 2 })).toBeVisible()

    await logFromSearch(page, 'Snacks', late)

    await openDay(page, '2026-03-15')
    await expect(meal(page, 'Snacks')).toContainText(late)
    await openDay(page, '2026-03-14')
    await expect(meal(page, 'Snacks')).not.toContainText(late)
  })
})

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`the log screen in the ${colorScheme} theme`, () => {
    test.use({ colorScheme })

    test('has no axe violations, nor do its dialogs', async ({ page }) => {
      const food = unique('Pear')
      const day = randomDay()
      await signIn(page)
      await addFood(page, food, '60')
      await openDay(page, day)
      await logFromSearch(page, 'Lunch', food)
      await expectNoAxeViolations(page)

      await page.getByRole('button', { name: 'Add to Dinner' }).click()
      await expect(page.getByRole('dialog', { name: 'Add to Dinner' })).toBeVisible()
      await expectNoAxeViolations(page)
      await page.keyboard.press('Escape')

      await meal(page, 'Lunch')
        .getByRole('button', { name: new RegExp(food) })
        .click()
      await expect(page.getByRole('dialog', { name: food })).toBeVisible()
      await expectNoAxeViolations(page)
      await page.getByRole('button', { name: 'Cancel' }).click()

      await page.getByRole('button', { name: 'Copy from… Copy into Snacks' }).click()
      await expect(page.getByRole('dialog', { name: 'Copy into Snacks' })).toBeVisible()
      await expectNoAxeViolations(page)
    })
  })
}
