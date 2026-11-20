import { expect, test } from '@playwright/test'
import { z } from 'zod/mini'

const manifestSchema = z.object({
  name: z.string(),
  display: z.string(),
  start_url: z.string(),
  icons: z.array(z.object({ src: z.string(), sizes: z.string(), type: z.string() })),
})

// Chrome's install criteria: a linked manifest with a name, a start URL, standalone display,
// 192 and 512 pixel icons, and a registered service worker.
test('the app is installable', async ({ page, request }) => {
  await page.goto('./')

  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(href).toBeTruthy()

  const response = await request.get(new URL(href ?? '', page.url()).toString())
  const manifest = manifestSchema.parse(await response.json())
  expect(manifest).toMatchObject({ name: 'Calorithm', display: 'standalone', start_url: './' })
  expect(manifest.icons.map((icon) => icon.sizes)).toEqual(
    expect.arrayContaining(['192x192', '512x512']),
  )

  for (const icon of manifest.icons) {
    const image = await request.get(new URL(icon.src, page.url()).toString())
    expect(image.headers()['content-type']).toBe('image/png')
  }

  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope)
  expect(scope).toMatch(/\/calorithm\/$/)
})
