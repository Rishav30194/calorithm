import { expect, type Page, test } from '@playwright/test'

import { checkinUser, expectNoAxeViolations, signInAs } from './helpers'

// Check-ins can't be deleted, and the local database keeps them between runs, so each test
// moves the clock 7 days past the latest stored check-in: a check-in is then always due.
const FIRST_DAY = '2090-01-06'

const addDays = (day: string, days: number): string =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)

const localDb = `calorithm-${checkinUser.id}`

// Reads the user's local check-ins once a pull has finished, so the server's are included.
const latestCheckinDate = async (page: Page): Promise<string | null> =>
  page.evaluate(
    (name) =>
      new Promise<string | null>((resolve, reject) => {
        const open = indexedDB.open(name)
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const all = open.result.transaction('checkins').objectStore('checkins').getAll()
          all.onsuccess = () => {
            const dates = (all.result as { date: string }[]).map((row) => row.date).sort()
            resolve(dates.at(-1) ?? null)
            open.result.close()
          }
          all.onerror = () => reject(all.error)
        }
      }),
    localDb,
  )

const waitForSync = async (page: Page) => {
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
          localDb,
        ),
      { timeout: 15_000 },
    )
    .toBe(0)
}

// Signs in on a fresh device, waits for the first pull, and fixes the clock to a day when a
// check-in is due. Returns that day.
const openOnDueDay = async (page: Page): Promise<string> => {
  await signInAs(page, checkinUser)
  await page.goto('./#/settings')
  await expect(page.getByText(/^Last synced/)).toBeVisible({ timeout: 15_000 })
  const latest = await latestCheckinDate(page)
  const today = latest === null ? FIRST_DAY : addDays(latest, 7)
  await page.clock.setFixedTime(new Date(`${today}T12:00:00`))
  await page.reload()
  return today
}

const fillProfile = async (page: Page) => {
  await page.goto('./#/settings')
  await page.getByLabel('Height (cm)').fill('175')
  await page.getByLabel('Birth date').fill('1990-04-12')
  await page.getByRole('radio', { name: 'Male', exact: true }).check()
  await page.getByRole('radio', { name: /^Moderate/ }).check()
  await page.getByRole('button', { name: 'Save profile' }).click()
  await expect(page.getByRole('main').getByRole('status').first()).toHaveText('Saved.')
}

const weighIn = async (page: Page, day: string) => {
  await page.goto('./#/weight')
  await page.getByLabel('Day', { exact: true }).fill(day)
  await page.getByLabel('Weight (kg)').fill('80')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('main').getByRole('status')).toHaveText('Saved.')
}

const markComplete = async (page: Page, day: string) => {
  await page.goto(`./#/log/day/${day}`)
  const complete = page.getByLabel('I logged everything I ate this day')
  await complete.check()
  await expect(complete).toBeEnabled()
}

const targetsShown = (page: Page) =>
  page.getByRole('region', { name: 'Daily targets' }).getByRole('definition').first()

test.describe('the weekly check-in', () => {
  // The tests share the user's check-ins, so they run in one project, in turn.
  test.skip(({ isMobile }) => isMobile, 'Runs in the desktop project only')
  test.describe.configure({ mode: 'serial' })

  test('saves targets that the log screen then shows', async ({ page }) => {
    const today = await openOnDueDay(page)
    await fillProfile(page)
    await weighIn(page, today)
    for (let days = 1; days <= 4; days++) await markComplete(page, addDays(today, -days))

    await page.goto('./#/checkin')
    await expect(page.getByText('Your check-in is ready.', { exact: false })).toBeVisible()
    await expectNoAxeViolations(page)
    const kcal = (await targetsShown(page).textContent()) ?? ''
    await page.getByRole('button', { name: 'Save check-in' }).click()
    await expect(page.getByRole('main').getByRole('status')).toHaveText(
      'Saved. Your targets are updated.',
    )
    await expect(page.getByText(/^Next check-in/)).toBeVisible()

    await page.goto('./#/log')
    await expect(page.getByRole('region', { name: 'Today against your targets' })).toContainText(
      `0 kcal of ${kcal}`,
    )
    await waitForSync(page)
  })

  // Phase 5 criterion: a week with fewer than 4 complete days leaves targets unchanged and
  // says why.
  test('a week with too few complete days keeps the targets and says why', async ({ page }) => {
    const today = await openOnDueDay(page)
    await page.emulateMedia({ colorScheme: 'dark' })
    await weighIn(page, today)

    await page.goto('./#/checkin')
    await expect(
      page.getByText(
        'Skipped this week: only 0 of the last 7 days are marked complete, and the check-in needs at least 4. Your targets stay the same.',
      ),
    ).toBeVisible()
    await expectNoAxeViolations(page)
    const kcal = (await targetsShown(page).textContent()) ?? ''
    await page.getByRole('button', { name: 'Save check-in' }).click()
    await expect(page.getByText(/^Next check-in/)).toBeVisible()
    await expect(targetsShown(page)).toHaveText(kcal)
    await waitForSync(page)
  })
})

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`the check-in screen in the ${colorScheme} theme`, () => {
    test.use({ colorScheme })

    // Reads only, so it runs in both projects.
    test('has no axe violations, nor does the log screen’s target area', async ({ page }) => {
      await signInAs(page, checkinUser)
      await page.goto('./#/checkin')
      await expect(page.getByRole('heading', { name: 'Weekly check-in' })).toBeVisible()
      await expectNoAxeViolations(page)
      await page.goto('./#/log')
      await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
      await expectNoAxeViolations(page)
    })
  })
}
