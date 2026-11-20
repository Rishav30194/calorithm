import { expect, test } from '@playwright/test'

// Chrome's install criteria: a linked manifest with a name, a start URL, standalone display,
// 192 and 512 pixel icons, and a registered service worker.
test('the app is installable', async ({ page, request }) => {
  await page.goto('./')

  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(href).toBeTruthy()

  const manifest = await (await request.get(new URL(href ?? '', page.url()).toString())).json()
  expect(manifest).toMatchObject({ name: 'Calorithm', display: 'standalone', start_url: './' })
  const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes)
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']))

  for (const icon of manifest.icons as { src: string }[]) {
    const response = await request.get(new URL(icon.src, page.url()).toString())
    expect(response.headers()['content-type']).toBe('image/png')
  }

  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope)
  expect(scope).toMatch(/\/calorithm\/$/)
})
