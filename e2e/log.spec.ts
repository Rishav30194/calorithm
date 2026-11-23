import { expect, type Page, test } from '@playwright/test'

import { removeBuiltInCopies } from './database'
import { expectNoAxeViolations, seedUser, signIn } from './helpers'

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
  // A piece with a weight, so one tap logs it; weighed foods have their own test.
  await page.getByLabel('Serving unit').fill('bowl (40 g)')
  await page.getByLabel('kcal per serving').fill(kcal)
  await page.getByLabel('Protein per serving (g)').fill('5')
  await page.getByLabel('Carbs per serving (g)').fill('27')
  await page.getByLabel('Fat per serving (g)').fill('2.5')
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
  await picker.getByRole('button', { name: new RegExp(`^${food}`) }).click()
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
  await picker.getByRole('button', { name: new RegExp(`^${oats}`) }).click() // Tap 2.

  await expect(
    meal(page, 'Breakfast').getByRole('button', { name: new RegExp(`^${oats}`) }),
  ).toContainText('1 serving · 150 kcal · 5 g protein')
})

// Phase 14: 70 g of a 100 g food is 0.7 servings, set when picked and again when edited.
test('a weighed food is logged and edited by its weight', async ({ page }) => {
  const chicken = unique('Chicken breast')
  await signIn(page)
  await page.goto('./#/log/foods/new')
  await page.getByLabel('Name').fill(chicken)
  await page.getByLabel('Serving size').fill('100')
  await page.getByLabel('Serving unit').fill('g')
  await page.getByLabel('kcal per serving').fill('165')
  await page.getByLabel('Protein per serving (g)').fill('31')
  await page.getByLabel('Carbs per serving (g)').fill('0')
  await page.getByLabel('Fat per serving (g)').fill('3.6')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('heading', { name: 'Foods', level: 2 })).toBeVisible()
  await openDay(page, randomDay())

  await page.getByRole('button', { name: 'Add to Lunch' }).click()
  const picker = page.getByRole('dialog', { name: 'Add to Lunch' })
  await picker.getByLabel('Search foods and recipes').fill(chicken)
  await picker.getByRole('button', { name: new RegExp(`^${chicken}`) }).click()
  await picker.getByLabel('Amount (g)').fill('70')
  await expect(picker.getByLabel('Servings')).toHaveValue('0.7')
  await expect(picker.getByRole('status')).toContainText('116 kcal · 21.7 g protein')
  await picker.getByRole('button', { name: 'Log' }).click()
  await expect(picker).toHaveCount(0)
  await expect(meal(page, 'Lunch')).toContainText('0.7 servings · 116 kcal')

  await meal(page, 'Lunch')
    .getByRole('button', { name: new RegExp(`^${chicken}`) })
    .click()
  const entry = page.getByRole('dialog', { name: chicken })
  await expect(entry.getByLabel('Amount (g)')).toHaveValue('70')
  await entry.getByLabel('Amount (g)').fill('150')
  await entry.getByRole('button', { name: 'Save' }).click()
  await expect(meal(page, 'Lunch')).toContainText('1.5 servings · 248 kcal')
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
    .getByRole('button', { name: new RegExp(`^${oats}`) })
    .click()
  await page.getByLabel('Servings').fill('2')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Day total').locator('..')).toContainText('300 kcal')

  // The day after, through its Next day link, rather than the device's real days.
  await page.getByRole('link', { name: 'Next day' }).click()
  await expect(page).toHaveURL(new RegExp(nextDay(day)))
  await logFromSearch(page, 'Dinner', oats)
  await expect(meal(page, 'Dinner')).toContainText(oats)

  await page.goto('./#/log/foods')
  await page.getByLabel('Search foods').fill(oats)
  await page.getByRole('link', { name: new RegExp(`^${oats}`) }).click()
  await page.getByLabel('kcal per serving').fill('400')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('heading', { name: 'Foods', level: 2 })).toBeVisible()

  await openDay(page, day)
  await expect(page.getByText('Day total').locator('..')).toContainText('300 kcal')
  await expect(meal(page, 'Lunch')).toContainText('2 servings · 300 kcal')
})

test('the picker offers recent foods with the servings last logged', async ({ page }) => {
  const rice = unique('Rice')
  const day = randomDay()
  await signIn(page)
  await addFood(page, rice, '270')
  await openDay(page, day)
  await logFromSearch(page, 'Dinner', rice)
  await meal(page, 'Dinner')
    .getByRole('button', { name: new RegExp(`^${rice}`) })
    .click()
  await page.getByLabel('Servings').fill('1.5')
  await page.getByRole('button', { name: 'Save' }).click()

  // Recent is relative to the day being logged; the day after a random far-future day has
  // no entries from other tests ahead of this one.
  await page.getByRole('link', { name: 'Next day' }).click()
  await expect(page).toHaveURL(new RegExp(nextDay(day)))
  await page.getByRole('button', { name: 'Add to Dinner' }).click()
  const picker = page.getByRole('dialog', { name: 'Add to Dinner' })
  const recent = picker.locator('section', { has: page.getByRole('heading', { name: 'Recent' }) })
  await expect(recent.getByRole('button').first()).toContainText(rice)
  await recent.getByRole('button', { name: new RegExp(`^${rice}`) }).click()

  await expect(
    meal(page, 'Dinner').getByRole('button', { name: new RegExp(`^${rice}`) }),
  ).toContainText('1.5 servings')
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
  await page.getByRole('button', { name: 'Copy from… into Breakfast' }).click()
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

// Phase 15 criterion: a meal built on the plate, one item changed to grams, logs at once.
test('a plate of three foods logs as three entries, one changed to grams', async ({ page }) => {
  const [first, second, third] = [unique('Plate A'), unique('Plate B'), unique('Plate C')]
  const day = randomDay()
  await signIn(page)
  for (const name of [first, second, third]) await addFood(page, name, '100')
  await openDay(page, day)

  await page.getByRole('button', { name: 'Add to Lunch' }).click()
  const picker = page.getByRole('dialog', { name: 'Add to Lunch' })
  for (const name of [first, second, third]) {
    await picker.getByLabel('Search foods and recipes').fill(name)
    await picker.getByRole('button', { name: `Add ${name} to the plate` }).click()
  }
  const plate = picker.getByRole('region', { name: 'Plate' })
  await plate.getByRole('button', { name: `Change the amount of ${second}` }).click()
  // addFood's serving is 40 bowls of 40 g, 1600 g, so 2400 g is 1.5 servings.
  await picker.getByLabel('Amount (g)').fill('2400')
  await picker.getByRole('button', { name: 'Update plate' }).click()
  await expect(plate).toContainText('Total: 350 kcal')
  await plate.getByRole('button', { name: 'Log all' }).click()
  await expect(picker).toHaveCount(0)

  const lunch = meal(page, 'Lunch')
  for (const name of [first, second, third]) await expect(lunch).toContainText(name)
  await expect(lunch.getByRole('button', { name: new RegExp(`^${second}`) })).toContainText(
    '150 kcal',
  )
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
      const dinner = page.getByRole('dialog', { name: 'Add to Dinner' })
      await expect(dinner).toBeVisible()
      await expectNoAxeViolations(page)
      // The plate, and the question before closing with it (phase 15).
      await dinner.getByLabel('Search foods and recipes').fill(food)
      await dinner.getByRole('button', { name: `Add ${food} to the plate` }).click()
      await expect(dinner.getByRole('region', { name: 'Plate' })).toBeVisible()
      await expectNoAxeViolations(page)
      await page.keyboard.press('Escape')
      await expect(dinner.getByRole('button', { name: 'Keep the plate' })).toBeVisible()
      await expectNoAxeViolations(page)
      await dinner.getByRole('button', { name: 'Throw it away' }).click()
      await expect(dinner).toHaveCount(0)

      await meal(page, 'Lunch')
        .getByRole('button', { name: new RegExp(`^${food}`) })
        .click()
      await expect(page.getByRole('dialog', { name: food })).toBeVisible()
      await expectNoAxeViolations(page)
      await page.getByRole('button', { name: 'Cancel' }).click()

      await page.getByRole('button', { name: 'Copy from… into Snacks' }).click()
      await expect(page.getByRole('dialog', { name: 'Copy into Snacks' })).toBeVisible()
      await expectNoAxeViolations(page)
    })
  })
}

test.describe('built-in foods (phase 10)', () => {
  // Both projects share the seed user, so one project resets and copies the item.
  test.skip(({ isMobile }) => isMobile, 'Runs in the desktop project only')

  test('a Hindi name finds a built-in food, and picking it adds it to your foods', async ({
    page,
  }) => {
    removeBuiltInCopies(seedUser.id, 'turmeric')
    const day = randomDay()
    await signIn(page)
    await openDay(page, day)

    await page.getByRole('button', { name: 'Add to Lunch' }).click()
    const picker = page.getByRole('dialog', { name: 'Add to Lunch' })
    await picker.getByLabel('Search foods and recipes').fill('haldi')
    const builtIn = picker.getByRole('region', { name: 'Built-in foods' })
    await expect(builtIn).toContainText('USDA FoodData Central')
    await builtIn.getByRole('button', { name: /^Turmeric/ }).click()
    await expect(picker).toHaveCount(0)
    await expect(meal(page, 'Lunch')).toContainText('Turmeric')
    await expect(meal(page, 'Lunch')).toContainText('9 kcal')

    await page.goto('./#/log/foods')
    await page.getByLabel('Search foods').fill('Turmeric')
    await page.getByRole('link', { name: /Turmeric/ }).click()
    await expect(page.getByText(/Added from the built-in foods/)).toBeVisible()
    await expect(page.getByLabel('Carbs per serving (g)')).toHaveValue('2')
  })
})
