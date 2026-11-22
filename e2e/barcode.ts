import { readFileSync } from 'node:fs'

import { expect, type Page, type Route } from '@playwright/test'

// Open Food Facts is never called: requests get responses recorded from its API
// (src/data/openFoodFacts/fixtures). Each test uses its own barcode and far-future day, since
// the local database keeps rows between runs.
const fixture = (name: string) =>
  readFileSync(new URL(`../src/data/openFoodFacts/fixtures/${name}`, import.meta.url), 'utf8')
export const found = fixture('product-found.json')
export const notFound = fixture('product-not-found.json')
const OFF_API = 'https://world.openfoodfacts.org/api/**'

const checkDigit = (body: string): string => {
  const sum = [...body]
    .reverse()
    .reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 3 : 1), 0)
  return String((10 - (sum % 10)) % 10)
}

// A random EAN-13 code in the in-store range (prefix 2), unlike any real pack.
export const randomBarcode = (): string => {
  const body = `2${String(Math.floor(Math.random() * 1e11)).padStart(11, '0')}`
  return `${body}${checkDigit(body)}`
}

export const randomDay = (): string => {
  const start = Date.UTC(2090, 0, 1)
  const days = Math.floor(Math.random() * 3_600)
  return new Date(start + days * 86_400_000).toISOString().slice(0, 10)
}

export const openDay = async (page: Page, day: string) => {
  await page.goto(`./#/log/day/${day}`)
  await expect(page.getByText('Day total')).toBeVisible()
}

export const openPicker = async (page: Page) => {
  await page.getByRole('button', { name: 'Add to Lunch' }).click()
  return page.getByRole('dialog', { name: 'Add to Lunch' })
}

export const enterBarcode = async (page: Page, code: string) => {
  const picker = await openPicker(page)
  await picker.getByRole('button', { name: 'Enter barcode' }).click()
  await picker.getByLabel('Barcode', { exact: true }).fill(code)
  await picker.getByRole('button', { name: 'Look up' }).click()
  return picker
}

// Answers Open Food Facts requests, counting them and keeping the last one's headers.
export const answer = async (page: Page, reply: (route: Route) => Promise<void>) => {
  const calls: Record<string, string>[] = []
  await page.route(OFF_API, async (route) => {
    calls.push(route.request().headers())
    await reply(route)
  })
  return calls
}

export const json = (status: number, body: string) => (route: Route) =>
  route.fulfill({ status, contentType: 'application/json', body })
