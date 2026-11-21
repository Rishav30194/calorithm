import { type BrowserContext, expect, type Page, test } from '@playwright/test'

import { serveBuildCopy } from './deployment'
import { expectNoAxeViolations } from './helpers'

const banner = (page: Page) => page.getByRole('region', { name: 'Update available' })

// A flag on the window that only a reload clears.
const markLoaded = (page: Page) => page.evaluate(() => Reflect.set(window, 'loadedBefore', true))
const stillLoaded = (page: Page) =>
  page.evaluate(() => Reflect.get(window, 'loadedBefore') === true)

// A tab of an app the device has used before: controlled by the installed service worker.
const openTab = async (context: BrowserContext, url: string): Promise<Page> => {
  const page = await context.newPage()
  await page.goto(url)
  // ready resolves once a worker is active. (waitForFunction treats an async function's
  // promise as truthy, so it can't wait for this.)
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  // A first visit isn't controlled until it loads again, and a new worker waits only while
  // pages are controlled. Playwright's reload() leaves the page uncontrolled, so navigate.
  await page.goto(url)
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await markLoaded(page)
  return page
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`a new deployment shows the update prompt without reloading on its own, ${colorScheme} theme (phase 6 criterion)`, async ({
    browser,
  }) => {
    const deployment = await serveBuildCopy()
    const context = await browser.newContext({ colorScheme })
    try {
      const first = await openTab(context, deployment.url)
      await expect(banner(first)).toHaveCount(0)

      await deployment.deployAgain()
      // Opening the app again after a deployment: the browser finds the new worker as the
      // page loads, and the plugin, tracking it, would reload this tab when it takes over.
      const second = await context.newPage()
      await second.goto(deployment.url)
      await markLoaded(second)
      await expect(banner(second)).toBeVisible({ timeout: 15_000 })

      // The first tab finds the waiting version with the check it runs on coming back to
      // the foreground (and hourly).
      await first.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
      await expect(banner(first)).toBeVisible({ timeout: 15_000 })
      expect(await stillLoaded(first)).toBe(true)
      await expectNoAxeViolations(first)

      // Updating in the first tab puts the new version in control of both tabs. Only the tab
      // that asked reloads; the second keeps its page and its banner.
      const reloaded = first.waitForEvent('load')
      await banner(first).getByRole('button', { name: 'Update' }).click()
      await reloaded
      expect(await stillLoaded(first)).toBe(false)
      await expect(banner(first)).toHaveCount(0)

      await second.waitForTimeout(1_000)
      await expect(banner(second)).toBeVisible()
      expect(await stillLoaded(second)).toBe(true)
    } finally {
      await context.close()
      await deployment.close()
    }
  })
}

test('Later hides the prompt until the app starts again', async ({ browser }) => {
  const deployment = await serveBuildCopy()
  const context = await browser.newContext()
  try {
    const page = await openTab(context, deployment.url)
    await deployment.deployAgain()
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await expect(banner(page)).toBeVisible({ timeout: 15_000 })

    await banner(page).getByRole('button', { name: 'Later' }).click()
    await expect(banner(page)).toHaveCount(0)
    expect(await stillLoaded(page)).toBe(true)

    await page.goto(deployment.url)
    await expect(banner(page)).toBeVisible({ timeout: 15_000 })
  } finally {
    await context.close()
    await deployment.close()
  }
})
