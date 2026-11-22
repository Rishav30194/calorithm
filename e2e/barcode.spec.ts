import { expect, test } from '@playwright/test'
import {
  answer,
  enterBarcode,
  found,
  json,
  notFound,
  openDay,
  openPicker,
  randomBarcode,
  randomDay,
} from './barcode'
import { expectNoAxeViolations, signIn } from './helpers'

test('a pack found on Open Food Facts is checked, saved, and logged; a second lookup works offline', async ({
  page,
  context,
}) => {
  const code = randomBarcode()
  const calls = await answer(page, json(200, found))
  await signIn(page)
  await openDay(page, randomDay())

  const picker = await enterBarcode(page, code)
  await expect(picker.getByText(/^Found on Open Food Facts/)).toBeVisible()
  await expect(picker.getByRole('link', { name: '© Open Food Facts contributors' })).toBeVisible()
  await expect(picker.getByLabel('Name')).toHaveValue('Nutella')
  await expect(picker.getByLabel('kcal per serving')).toHaveValue('539')
  await expect(picker.getByLabel('Barcode (optional)')).toHaveValue(code)
  await picker.getByRole('button', { name: 'Save and log' }).click()
  await expect(picker).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Lunch' })).toContainText('Nutella')

  // Only the barcode goes out, with the app named in X-User-Agent.
  expect(calls).toHaveLength(1)
  expect(calls[0]?.['x-user-agent']).toMatch(
    /^Calorithm\/\S+ \(https:\/\/github\.com\/Rishav30194\/calorithm\)$/,
  )

  await context.setOffline(true)
  const again = await enterBarcode(page, code)
  await expect(again.getByRole('heading', { name: 'Your foods with this barcode' })).toBeVisible()
  await again.getByRole('button', { name: /^Nutella/ }).click()
  await expect(again).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Lunch' }).getByText('Nutella')).toHaveCount(2)
  expect(calls).toHaveLength(1)
  await context.setOffline(false)
})

test('an unknown barcode opens an empty form with the barcode filled in', async ({ page }) => {
  const code = randomBarcode()
  await answer(page, json(404, notFound))
  await signIn(page)
  await openDay(page, randomDay())

  const picker = await enterBarcode(page, code)
  await expect(picker.getByText(/^Open Food Facts doesn’t have this barcode/)).toBeVisible()
  await expect(picker.getByLabel('Name')).toHaveValue('')
  await expect(picker.getByLabel('Barcode (optional)')).toHaveValue(code)
})

test('no network says so and offers entering the food by hand', async ({ page }) => {
  await answer(page, (route) => route.abort('internetdisconnected'))
  await signIn(page)
  await openDay(page, randomDay())

  const picker = await enterBarcode(page, randomBarcode())
  await expect(picker.getByText(/^Couldn’t reach Open Food Facts/)).toBeVisible()
  await expect(picker.getByRole('button', { name: 'Save and log' })).toBeVisible()
})

test('a mistyped barcode is caught before any lookup', async ({ page }) => {
  const calls = await answer(page, json(200, found))
  await signIn(page)
  await openDay(page, randomDay())

  const picker = await enterBarcode(page, '6291041500214')
  await expect(picker.getByLabel('Barcode', { exact: true })).toHaveAccessibleDescription(
    /last digit doesn’t match/,
  )
  expect(calls).toHaveLength(0)
})

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`barcode screens in the ${scheme} theme`, () => {
    test.use({ colorScheme: scheme })

    test('have no axe violations', async ({ page }) => {
      await answer(page, json(200, found))
      await signIn(page)
      await openDay(page, randomDay())
      const picker = await openPicker(page)
      await picker.getByRole('button', { name: 'Enter barcode' }).click()
      await expectNoAxeViolations(page)
      await picker.getByLabel('Barcode', { exact: true }).fill(randomBarcode())
      await picker.getByRole('button', { name: 'Look up' }).click()
      await expect(picker.getByText(/^Found on Open Food Facts/)).toBeVisible()
      await expectNoAxeViolations(page)
    })
  })
}
