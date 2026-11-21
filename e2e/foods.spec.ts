import { expect, type Page, test } from '@playwright/test'

import { expectNoAxeViolations, signIn } from './helpers'

// Rows stay in the local database between runs, so every name is unique to its test run.
const unique = (name: string) =>
  `${name} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

const openList = async (page: Page, list: 'Foods' | 'Recipes') => {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Log' }).click()
  await page
    .getByRole('navigation', { name: 'Foods and recipes' })
    .getByRole('link', { name: list })
    .click()
  await expect(page.getByRole('heading', { name: list, level: 2 })).toBeVisible()
}

const addFood = async (
  page: Page,
  food: { name: string; size: string; unit: string; kcal: string; protein: string },
) => {
  await openList(page, 'Foods')
  await page.getByRole('link', { name: 'Add food' }).click()
  await page.getByLabel('Name').fill(food.name)
  await page.getByLabel('Serving size').fill(food.size)
  await page.getByLabel('Serving unit').fill(food.unit)
  await page.getByLabel('kcal per serving').fill(food.kcal)
  await page.getByLabel('Protein per serving (g)').fill(food.protein)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('heading', { name: 'Foods', level: 2 })).toBeVisible()
}

const search = (page: Page, label: string, text: string) => page.getByLabel(label).fill(text)

test('a food can be created, edited, archived, and restored', async ({ page }) => {
  const name = unique('Oats')
  await signIn(page)
  await addFood(page, { name, size: '40', unit: 'g', kcal: '150', protein: '5' })

  await search(page, 'Search foods', name)
  const row = page.getByRole('link', { name: new RegExp(name) })
  await expect(row).toContainText('40 g · 150 kcal · 5 g protein')

  await row.click()
  await page.getByLabel('kcal per serving').fill('160')
  await page.getByRole('button', { name: 'Save' }).click()
  await search(page, 'Search foods', name)
  await expect(page.getByRole('link', { name: new RegExp(name) })).toContainText('160 kcal')

  await page.getByRole('link', { name: new RegExp(name) }).click()
  await page.getByRole('button', { name: 'Archive' }).click()
  await expect(page.getByText(/^Archived\./)).toBeVisible()
  await page.getByRole('link', { name: 'Back to foods' }).click()
  await search(page, 'Search foods', name)
  await expect(page.getByRole('link', { name: new RegExp(name) })).toHaveCount(0)

  await page.getByLabel('Show archived').check()
  await page.getByRole('link', { name: new RegExp(name) }).click()
  await page.getByRole('button', { name: 'Restore' }).click()
  await expect(page.getByRole('button', { name: 'Archive' })).toBeVisible()
})

test('a recipe totals its ingredients', async ({ page }) => {
  const oats = unique('Oats')
  const milk = unique('Milk')
  const porridge = unique('Porridge')
  await signIn(page)
  await addFood(page, { name: oats, size: '40', unit: 'g', kcal: '150', protein: '5' })
  await addFood(page, { name: milk, size: '100', unit: 'ml', kcal: '65', protein: '3.4' })

  await openList(page, 'Recipes')
  await page.getByRole('link', { name: 'Add recipe' }).click()
  await page.getByLabel('Name').fill(porridge)
  await page.getByLabel('Servings it makes').fill('4')
  for (const food of [oats, milk]) {
    await page.getByRole('button', { name: 'Add ingredient' }).click()
    const picker = page.getByRole('dialog', { name: 'Add an ingredient' })
    await picker.getByLabel('Search foods').fill(food)
    await picker.getByRole('button', { name: new RegExp(food) }).click()
  }
  await page.getByLabel(`Servings of ${oats}`).fill('2')

  // 150 × 2 + 65 = 365 kcal and 13.4 g; a quarter is 91 kcal and 3.4 g.
  await expect(page.getByText('Whole recipe').locator('+ dd')).toHaveText(
    '365 kcal · 13.4 g protein',
  )
  await expect(page.getByText('Per serving').locator('+ dd')).toHaveText('91 kcal · 3.4 g protein')

  await page.getByRole('button', { name: 'Save' }).click()
  await search(page, 'Search recipes', porridge)
  await expect(page.getByRole('link', { name: new RegExp(porridge) })).toContainText(
    'Makes 4 · 91 kcal · 3.4 g protein a serving',
  )
})

test('an editor link to a row that isn’t stored says so', async ({ page }) => {
  await signIn(page)
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
  await page.goto('./#/log/foods/f0000000-0000-4000-8000-0000000000ff')
  await expect(page.getByText(/This food isn’t on this device/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Back to foods' })).toBeVisible()
})

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`food screens in the ${colorScheme} theme`, () => {
    test.use({ colorScheme })

    test('have no axe violations', async ({ page }) => {
      const food = unique('Rice')
      await signIn(page)
      await addFood(page, { name: food, size: '75', unit: 'g', kcal: '270', protein: '5.3' })
      await expectNoAxeViolations(page)

      await page.getByRole('link', { name: 'Add food' }).click()
      await page.getByRole('button', { name: 'Save' }).click()
      await expect(page.getByText('Enter a name of up to 100 characters.')).toBeVisible()
      await expectNoAxeViolations(page)

      await openList(page, 'Recipes')
      await expectNoAxeViolations(page)

      await page.getByRole('link', { name: 'Add recipe' }).click()
      await expectNoAxeViolations(page)
      await page.getByRole('button', { name: 'Add ingredient' }).click()
      await expect(page.getByRole('dialog', { name: 'Add an ingredient' })).toBeVisible()
      await expectNoAxeViolations(page)
    })
  })
}
