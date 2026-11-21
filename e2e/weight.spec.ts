import { expect, type Page, test } from '@playwright/test'

import { expectNoAxeViolations, signInAs, unitsUser, weightUser } from './helpers'

// The local database keeps rows between runs, and the phone and desktop projects share the
// weight user, so each test fixes the clock to its own random past day and deletes its
// weigh-ins at the end. A past moment never makes the session look expired.
const randomDayBetween = (from: number, days: number): string =>
  new Date(from + Math.floor(Math.random() * days) * 86_400_000).toISOString().slice(0, 10)

const randomPastDay = (): string => randomDayBetween(Date.UTC(2001, 0, 1), 8_800)

// The trend counts every earlier weigh-in, including any a failed test left behind, so the
// trend test uses days in 2000, before any other test's: from 2000-01-02, so the day before
// is still one the database accepts.
const randomDayIn2000 = (): string => randomDayBetween(Date.UTC(2000, 0, 2), 360)

const dayBefore = (day: string): string =>
  new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)

// Matches formatDay in src/ui/weight/days.ts.
const shortDay = (page: Page, day: string): Promise<string> =>
  page.evaluate((date) => {
    const [year = 0, month = 1, dayOfMonth = 1] = date.split('-').map(Number)
    return new Intl.DateTimeFormat(navigator.language, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(new Date(year, month - 1, dayOfMonth))
  }, day)

const openWeight = async (page: Page, today: string, user = weightUser) => {
  await page.clock.setFixedTime(new Date(`${today}T12:00:00Z`))
  await signInAs(page, user)
  await page.goto('./#/weight')
  await expect(page.getByRole('heading', { name: 'Weigh in', level: 2 })).toBeVisible()
}

const weighIn = async (page: Page, day: string, weight: string) => {
  await page.getByLabel('Day', { exact: true }).fill(day)
  await page.getByLabel(/^Weight \((kg|lb)\)$/).fill(weight)
  await page.getByRole('button', { name: 'Save' }).click()
  // The sync badge in the header is a status too.
  await expect(page.getByRole('main').getByRole('status')).toHaveText('Saved.')
}

const row = async (page: Page, day: string) =>
  page.getByRole('row').filter({
    has: page.getByRole('button', { name: `Edit weigh-in for ${await shortDay(page, day)}` }),
  })

// Waits until the outbox is empty, so a test's cleanup reaches the server before it ends.
// Reads IndexedDB directly, so it doesn't depend on where the settings screen shows it.
const waitForSync = async (page: Page, userId: string) => {
  await expect
    .poll(
      () =>
        page.evaluate(
          (name) =>
            new Promise<number>((resolve, reject) => {
              const open = indexedDB.open(name)
              open.onerror = () => reject(open.error)
              open.onsuccess = () => {
                const count = open.result.transaction('outbox').objectStore('outbox').count()
                count.onsuccess = () => {
                  resolve(count.result)
                  open.result.close()
                }
                count.onerror = () => reject(count.error)
              }
            }),
          `calorithm-${userId}`,
        ),
      { timeout: 15_000 },
    )
    .toBe(0)
}

const remove = async (page: Page, day: string) => {
  const label = `Edit weigh-in for ${await shortDay(page, day)}`
  await page.getByRole('button', { name: label }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByRole('button', { name: label })).toHaveCount(0)
}

test('a second weigh-in on the same day replaces the first (phase 4 criterion)', async ({
  page,
}) => {
  const today = randomPastDay()
  await openWeight(page, today)

  await weighIn(page, today, '80.4')
  await expect(await row(page, today)).toContainText('80.4 kg')

  // The hint describes the next save, so it shows once a new weight is typed.
  await page.getByLabel('Weight (kg)').fill('79.8')
  await expect(
    page.getByText('This replaces the weigh-in already saved for this day.'),
  ).toBeVisible()
  await weighIn(page, today, '79.8')
  await expect(await row(page, today)).toHaveCount(1)
  await expect(await row(page, today)).toContainText('79.8 kg')

  // Survives a reload, so it was stored rather than only shown.
  await page.reload()
  await expect(await row(page, today)).toContainText('79.8 kg')

  await remove(page, today)
  await waitForSync(page, weightUser.id)
})

test('weigh-ins show the trend, the chart, and a summary', async ({ page }) => {
  const today = randomDayIn2000()
  const yesterday = dayBefore(today)
  await openWeight(page, today)

  await weighIn(page, yesterday, '81')
  await weighIn(page, today, '80')

  // The trend: 81, then 81 + 0.1 × (80 − 81) = 80.9.
  await expect(page.getByText('Trend 80.9 kg')).toBeVisible()
  await expect(await row(page, today)).toContainText('80 kg80.9 kg')
  const chart = page.getByRole('region', { name: 'Weight chart' })
  await expect(chart).toContainText('weigh-ins between 80 kg and 81 kg')

  // Editing a listed weigh-in changes it in place.
  await page
    .getByRole('button', { name: `Edit weigh-in for ${await shortDay(page, yesterday)}` })
    .click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Weight (kg)').fill('82')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(await row(page, yesterday)).toContainText('82 kg')

  await remove(page, today)
  await remove(page, yesterday)
  await waitForSync(page, weightUser.id)
})

for (const colorScheme of ['light', 'dark'] as const) {
  test(`the weight screen has no axe violations in the ${colorScheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme })
    const today = randomPastDay()
    await openWeight(page, today)
    await expectNoAxeViolations(page)

    await weighIn(page, today, '80')
    await page.getByLabel('Weight (kg)').fill('5')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Enter a weight between 20 kg and 400 kg.')).toBeVisible()
    await expectNoAxeViolations(page)

    await page
      .getByRole('button', { name: `Edit weigh-in for ${await shortDay(page, today)}` })
      .click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expectNoAxeViolations(page)
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()

    await remove(page, today)
    await waitForSync(page, weightUser.id)
  })
}

test.describe('units', () => {
  // Changes the units user's profile, so only one project runs it.
  test.skip(({ isMobile }) => isMobile, 'Runs in the desktop project only')

  const chooseUnits = async (page: Page, name: 'Metric (kg)' | 'Imperial (lb)') => {
    await page.goto('./#/settings')
    await page.getByRole('radio', { name }).check()
    await expect(page.getByRole('radio', { name })).toBeChecked()
    await page.goto('./#/weight')
  }

  test('switch without changing stored values (phase 4 criterion)', async ({ page }) => {
    const today = randomPastDay()
    await openWeight(page, today, unitsUser)
    await chooseUnits(page, 'Imperial (lb)')

    await weighIn(page, today, '180')
    await expect(await row(page, today)).toContainText('180 lb')

    // 180 lb is stored as 81.65 kg, shown with one decimal.
    await chooseUnits(page, 'Metric (kg)')
    await expect(await row(page, today)).toContainText('81.7 kg')

    await chooseUnits(page, 'Imperial (lb)')
    await expect(await row(page, today)).toContainText('180 lb')

    await remove(page, today)
    await chooseUnits(page, 'Metric (kg)')
    await waitForSync(page, unitsUser.id)
  })
})
