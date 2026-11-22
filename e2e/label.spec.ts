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

// A label drawn in the browser as a PNG, so real text recognition reads a real image.
const labelPhoto = async (page: import('@playwright/test').Page, lines: string[]) => {
  const dataUrl = await page.evaluate((text) => {
    const canvas = document.createElement('canvas')
    canvas.width = 900
    canvas.height = 80 + text.length * 56
    const context = canvas.getContext('2d')
    if (!context) throw new Error('no canvas')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = '#000000'
    context.font = '36px Arial, Helvetica, sans-serif'
    for (const [index, line] of text.entries()) context.fillText(line, 40, 70 + index * 56)
    return canvas.toDataURL('image/png')
  }, lines)
  return {
    name: 'label.png',
    mimeType: 'image/png',
    buffer: Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'),
  }
}

test('a photo of a label is read on the device into the food form', async ({ page }) => {
  test.slow()
  const requests: string[] = []
  page.on('request', (request) => requests.push(request.url()))
  await signIn(page)
  await openDay(page, randomDay())

  const picker = await openPicker(page)
  await picker.getByRole('button', { name: 'Read nutrition label' }).click()
  const photo = await labelPhoto(page, [
    'Nutrition Information',
    'Per 100 g',
    'Energy 380 kcal',
    'Protein 12.5 g',
    'Carbohydrate 61.0 g',
    'Total Fat 9.4 g',
  ])
  await picker.getByLabel('Photo of label').setInputFiles(photo)

  await expect(picker.getByLabel('kcal per serving')).toHaveValue('380', { timeout: 60_000 })
  await expect(picker.getByLabel('Protein per serving (g)')).toHaveValue('12.5')
  await expect(picker.getByLabel('Carbs per serving (g)')).toHaveValue('61')
  await expect(picker.getByLabel('Fat per serving (g)')).toHaveValue('9.4')
  // The reader loads only from the app, and the photo goes nowhere: the only other host is
  // local Supabase, for sync.
  const hosts = new Set(requests.map((url) => new URL(url).hostname))
  hosts.delete('')
  expect([...hosts].sort()).toEqual(['127.0.0.1', 'localhost'])
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
