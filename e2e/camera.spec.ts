import { expect, test } from '@playwright/test'

import { answer, found, json, openDay, openPicker, randomBarcode, randomDay } from './barcode'
import { barcodeVideo } from './barcodeVideo'
import { signIn } from './helpers'

// Chromium's fake camera shows a generated EAN-13 barcode, so the real decoder reads an image.
// Launch options apply to the whole file, so the camera tests have their own. The full
// Chromium build runs them: Playwright's default headless shell has no camera capture.
const code = randomBarcode()
test.use({
  channel: 'chromium',
  permissions: ['camera'],
  launchOptions: {
    args: [
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${barcodeVideo(code)}`,
    ],
  },
})

test('scanning reads the code with the app’s own decoder and looks it up', async ({ page }) => {
  await answer(page, json(200, found))
  const decoder: string[] = []
  page.on('request', (request) => {
    if (/\.wasm(\?|$)/.test(request.url())) decoder.push(request.url())
  })
  await signIn(page)
  await openDay(page, randomDay())

  const picker = await openPicker(page)
  await picker.getByRole('button', { name: 'Scan barcode' }).click()
  await expect(picker.getByText(/^Found on Open Food Facts/)).toBeVisible({ timeout: 15_000 })
  await expect(picker.getByLabel('Barcode (optional)')).toHaveValue(code)
  // Served from the app (or its service worker), never the library's default CDN.
  expect(decoder.length).toBeGreaterThan(0)
  for (const url of decoder) expect(url).toContain('/calorithm/assets/zxing_reader-')
})

test.describe('with camera access denied', () => {
  test.use({ permissions: [] })

  test('a denied camera says so and offers typing the code', async ({ page }) => {
    await signIn(page)
    await openDay(page, randomDay())
    const picker = await openPicker(page)
    await picker.getByRole('button', { name: 'Scan barcode' }).click()
    await expect(picker.getByRole('alert')).toContainText(/^Camera access is off/)
    await expect(picker.getByLabel('Barcode', { exact: true })).toBeVisible()
  })
})
