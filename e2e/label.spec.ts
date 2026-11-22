import { expect, test } from '@playwright/test'

import { openDay, openPicker, randomDay } from './barcode'
import { expectNoAxeViolations, signIn } from './helpers'

// Synthetic label text, as the iPhone's Live Text copies it from a photo of a pack.
const label = `NUTRITIONAL INFORMATION (Approx.)
Per 100 g of product
Energy (kcal) 456
Protein (g) 7.2
Carbohydrate (g) 64.5
Total Sugars (g) 18.0
Total Fat (g) 18.9
Saturated Fat (g) 9.1`

const unique = (name: string) =>
  `${name} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

test('pasted label text fills the food form, and the food is saved and logged', async ({
  page,
}) => {
  const name = unique('Biscuits')
  await signIn(page)
  await openDay(page, randomDay())

  const picker = await openPicker(page)
  await picker.getByRole('button', { name: 'Read nutrition label' }).click()
  await picker.getByLabel('Label text').fill(label)
  await picker.getByRole('button', { name: 'Read label' }).click()

  await expect(picker.getByLabel('Serving size')).toHaveValue('100')
  await expect(picker.getByLabel('kcal per serving')).toHaveValue('456')
  await expect(picker.getByLabel('Protein per serving (g)')).toHaveValue('7.2')
  await expect(picker.getByLabel('Carbs per serving (g)')).toHaveValue('64.5')
  await expect(picker.getByLabel('Fat per serving (g)')).toHaveValue('18.9')
  await picker.getByLabel('Name').fill(name)
  await picker.getByRole('button', { name: 'Save and log' }).click()

  await expect(picker).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Lunch' })).toContainText(name)
})

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`label screens in the ${scheme} theme`, () => {
    test.use({ colorScheme: scheme })

    test('have no axe violations', async ({ page }) => {
      await signIn(page)
      await openDay(page, randomDay())
      const picker = await openPicker(page)
      await picker.getByRole('button', { name: 'Read nutrition label' }).click()
      await picker.getByRole('button', { name: 'Read label' }).click()
      await expect(picker.getByText(/^No nutrition values found/)).toBeVisible()
      await expectNoAxeViolations(page)
      await picker.getByLabel('Label text').fill('Per 100 g\nEnergy 250 kcal')
      await picker.getByRole('button', { name: 'Read label' }).click()
      await expect(picker.getByText(/couldn’t be read/)).toBeVisible()
      await expectNoAxeViolations(page)
    })
  })
}
