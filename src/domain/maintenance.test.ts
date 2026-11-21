import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { addDays } from './dates'
import {
  activityLevels,
  ageOn,
  type Body,
  type DayIntake,
  estimateMaintenance,
  formulaMaintenance,
  type MaintenanceInput,
} from './maintenance'
import type { WeighIn } from './trend'

const today = '2026-11-21'
const yesterday = '2026-11-20'

const body: Body = {
  heightCm: 180,
  birthDate: '1996-06-01',
  sex: 'male',
  activityLevel: 'moderate',
}

// Days ending yesterday, oldest first, each with the same intake.
const daysBack = (count: number, kcal: number, complete = true): DayIntake[] =>
  Array.from({ length: count }, (_, i) => ({
    date: addDays(yesterday, i - count + 1),
    kcal,
    complete,
  }))

const input = (overrides: Partial<MaintenanceInput>): MaintenanceInput => ({
  today,
  weighIns: [{ date: '2026-09-01', kg: 80 }],
  days: daysBack(28, 2200),
  previousKcal: null,
  body,
  ...overrides,
})

describe('ageOn', () => {
  it('counts whole years, before and after the birthday', () => {
    expect(ageOn('1996-06-01', '2026-05-31')).toBe(29)
    expect(ageOn('1996-06-01', '2026-06-01')).toBe(30)
    expect(ageOn('2000-02-29', '2027-02-28')).toBe(26)
    expect(ageOn('2000-02-29', '2027-03-01')).toBe(27)
  })
})

describe('formulaMaintenance', () => {
  // Mifflin-St Jeor, hand-computed:
  // male, 80 kg, 180 cm, 30 years: 800 + 1,125 − 150 + 5 = 1,780; × 1.55 (moderate) = 2,759
  // female, 60 kg, 165 cm, 40 years: 600 + 1,031.25 − 200 − 161 = 1,270.25; × 1.2 = 1,524.3
  it('matches hand-computed values', () => {
    expect(
      formulaMaintenance({
        weightKg: 80,
        heightCm: 180,
        ageYears: 30,
        sex: 'male',
        activityLevel: 'moderate',
      }),
    ).toBeCloseTo(2759, 6)
    expect(
      formulaMaintenance({
        weightKg: 60,
        heightCm: 165,
        ageYears: 40,
        sex: 'female',
        activityLevel: 'sedentary',
      }),
    ).toBeCloseTo(1524.3, 6)
  })

  it('rises with each activity level', () => {
    const values = activityLevels.map((activityLevel) =>
      formulaMaintenance({ weightKg: 80, heightCm: 180, ageYears: 30, sex: 'male', activityLevel }),
    )
    expect([...values].sort((a, b) => a - b)).toEqual(values)
  })
})

describe('estimateMaintenance', () => {
  it('is blocked without a weigh-in on or before today', () => {
    expect(estimateMaintenance(input({ weighIns: [] }))).toEqual({
      kind: 'blocked',
      reason: 'no_weigh_ins',
    })
    expect(estimateMaintenance(input({ weighIns: [{ date: '2026-11-22', kg: 80 }] }))).toEqual({
      kind: 'blocked',
      reason: 'no_weigh_ins',
    })
  })

  it('uses the formula, with today’s weigh-in, until 14 days of data exist', () => {
    const result = estimateMaintenance(input({ weighIns: [{ date: today, kg: 80 }] }))
    expect(result).toEqual({
      kind: 'updated',
      method: 'formula',
      rawKcal: 2759,
      maintenanceKcal: 2759,
      trendWeightKg: 80,
      completeDaysInWeek: 7,
      window: null,
    })
  })

  it('is blocked when the formula needs a profile field that’s missing', () => {
    for (const missing of ['heightCm', 'birthDate', 'sex', 'activityLevel'] as const) {
      const result = estimateMaintenance(
        input({ weighIns: [{ date: today, kg: 80 }], body: { ...body, [missing]: null } }),
      )
      expect(result).toEqual({ kind: 'blocked', reason: 'profile_incomplete' })
    }
  })

  // Hand-computed: the trend is 80 until yesterday's 70 kg weigh-in moves it to 79. Over the
  // 28-day window it fell 1 kg: 2,000 + 7,700 × 1 ÷ 28 = 2,275 kcal.
  it('estimates from intake and the trend’s change over 28 days', () => {
    const result = estimateMaintenance(
      input({
        weighIns: [
          { date: '2026-09-01', kg: 80 },
          { date: yesterday, kg: 70 },
        ],
        days: daysBack(28, 2000),
      }),
    )
    expect(result).toEqual({
      kind: 'updated',
      method: 'adaptive',
      rawKcal: 2275,
      maintenanceKcal: 2275,
      trendWeightKg: 79,
      completeDaysInWeek: 7,
      window: { days: 28, completeDays: 28, averageIntakeKcal: 2000, trendChangeKg: -1 },
    })
  })

  it('switches to the adaptive estimate once the window can span 14 days', () => {
    const at = (first: string) =>
      estimateMaintenance(input({ weighIns: [{ date: first, kg: 80 }] }))
    // First weigh-in 14 days ago: 13 days from it to yesterday, too short.
    expect(at(addDays(today, -14))).toMatchObject({ method: 'formula', window: null })
    expect(at(addDays(today, -15))).toMatchObject({
      method: 'adaptive',
      window: { days: 14, completeDays: 14 },
    })
  })

  it('averages only complete days, and ignores days outside the window', () => {
    const days = [
      ...daysBack(40, 9000, false),
      { date: addDays(yesterday, -30), kcal: 9000, complete: true },
      ...daysBack(28, 2000).filter((_, i) => i % 2 === 1),
    ]
    const result = estimateMaintenance(input({ days }))
    expect(result).toMatchObject({
      rawKcal: 2000,
      window: { days: 28, completeDays: 14, averageIntakeKcal: 2000 },
    })
  })

  it('moves halfway toward the new estimate, at most 150 kcal', () => {
    const steady = (previousKcal: number, kcal: number) =>
      estimateMaintenance(input({ previousKcal, days: daysBack(28, kcal) }))
    expect(steady(2500, 2300)).toMatchObject({ rawKcal: 2300, maintenanceKcal: 2400 })
    expect(steady(2500, 2000)).toMatchObject({ rawKcal: 2000, maintenanceKcal: 2350 })
    expect(steady(2000, 2600)).toMatchObject({ rawKcal: 2600, maintenanceKcal: 2150 })
  })

  it('skips a week with fewer than 4 complete days, when there’s a previous estimate', () => {
    const days = [...daysBack(28, 2000).slice(0, 21), ...daysBack(7, 2000, false)]
    days[days.length - 1] = { date: yesterday, kcal: 2000, complete: true }
    days[days.length - 2] = { date: addDays(yesterday, -1), kcal: 2000, complete: true }
    days[days.length - 3] = { date: addDays(yesterday, -2), kcal: 2000, complete: true }
    expect(estimateMaintenance(input({ previousKcal: 2500, days }))).toEqual({
      kind: 'skipped',
      reason: 'too_few_complete_days',
      completeDaysInWeek: 3,
      trendWeightKg: 80,
    })
  })

  it('uses the formula for a first check-in with too few complete days', () => {
    expect(estimateMaintenance(input({ days: daysBack(28, 2000, false) }))).toMatchObject({
      kind: 'updated',
      method: 'formula',
      completeDaysInWeek: 0,
    })
  })
})

// Properties from docs/testing.md, "Calculations".
const history = fc
  .array(
    fc.record({
      offset: fc.integer({ min: 0, max: 60 }),
      kg: fc.integer({ min: 2000, max: 40000 }).map((h) => h / 100),
    }),
    { minLength: 1, maxLength: 30 },
  )
  .map((items): WeighIn[] => items.map(({ offset, kg }) => ({ date: addDays(today, -offset), kg })))

const intakeDays = fc
  .array(fc.record({ kcal: fc.integer({ min: 0, max: 8000 }), complete: fc.boolean() }), {
    minLength: 35,
    maxLength: 35,
  })
  .map((items): DayIntake[] =>
    items.map((item, i) => ({ date: addDays(yesterday, i - items.length + 1), ...item })),
  )

const anyBody = fc.record({
  heightCm: fc.option(
    fc.integer({ min: 1000, max: 2500 }).map((t) => t / 10),
    { nil: null },
  ),
  birthDate: fc.option(fc.constantFrom('1900-01-01', '1950-07-15', '1990-02-28', '2020-11-21'), {
    nil: null,
  }),
  sex: fc.option(fc.constantFrom('female' as const, 'male' as const), { nil: null }),
  activityLevel: fc.option(fc.constantFrom(...activityLevels), { nil: null }),
})

const anyInput = fc.record({
  today: fc.constant(today),
  weighIns: history,
  days: intakeDays,
  previousKcal: fc.option(fc.integer({ min: 0, max: 20000 }), { nil: null }),
  body: anyBody,
})

describe('estimateMaintenance properties', () => {
  it('gives maintenance equal to intake for a flat trend and steady intake', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2000, max: 40000 }),
        fc.integer({ min: 0, max: 8000 }),
        fc.integer({ min: 15, max: 60 }),
        (hundredths, kcal, since) => {
          const weighIns = [{ date: addDays(today, -since), kg: hundredths / 100 }]
          const result = estimateMaintenance(
            input({ weighIns, days: daysBack(28, kcal), previousKcal: kcal }),
          )
          expect(result).toMatchObject({ kind: 'updated', rawKcal: kcal, maintenanceKcal: kcal })
        },
      ),
    )
  })

  it('changes nothing in a week with fewer than 4 complete days', () => {
    fc.assert(
      fc.property(anyInput, fc.integer({ min: 0, max: 20000 }), (values, previousKcal) => {
        const lastWeek = (date: string) => date >= addDays(today, -7)
        let kept = 0
        const days = values.days.map((day) => {
          if (!lastWeek(day.date) || !day.complete) return day
          kept += 1
          return kept <= 3 ? day : { ...day, complete: false }
        })
        const result = estimateMaintenance({ ...values, days, previousKcal })
        expect(['skipped', 'blocked']).toContain(result.kind)
      }),
    )
  })

  it('counts a repeated date once, using the last entry for it', () => {
    fc.assert(
      fc.property(anyInput, (values) => {
        const repeated = [...values.days, ...values.days.map((day) => ({ ...day }))]
        expect(estimateMaintenance({ ...values, days: repeated })).toEqual(
          estimateMaintenance(values),
        )
        const result = estimateMaintenance({ ...values, days: repeated })
        if (result.kind !== 'blocked') expect(result.completeDaysInWeek).toBeLessThanOrEqual(7)
      }),
    )
  })

  it('uses the last entry when a date repeats', () => {
    const days = [...daysBack(28, 2000), ...daysBack(28, 2400)]
    expect(estimateMaintenance(input({ days }))).toMatchObject({
      rawKcal: 2400,
      completeDaysInWeek: 7,
      window: { completeDays: 28, averageIntakeKcal: 2400 },
    })
  })

  it('never lets incomplete days affect the result', () => {
    fc.assert(
      fc.property(anyInput, fc.integer({ min: 0, max: 8000 }), (values, kcal) => {
        const changed = values.days.map((day) => (day.complete ? day : { ...day, kcal }))
        expect(estimateMaintenance({ ...values, days: changed })).toEqual(
          estimateMaintenance(values),
        )
      }),
    )
  })

  it('never moves the estimate more than 150 kcal in one check-in', () => {
    fc.assert(
      fc.property(anyInput, fc.integer({ min: 0, max: 20000 }), (values, previousKcal) => {
        const result = estimateMaintenance({ ...values, previousKcal })
        if (result.kind === 'updated') {
          expect(Math.abs(result.maintenanceKcal - previousKcal)).toBeLessThanOrEqual(150)
        }
      }),
    )
  })

  it('stays within the ranges the checkins table allows', () => {
    fc.assert(
      fc.property(anyInput, (values) => {
        const result = estimateMaintenance(values)
        if (result.kind === 'blocked') return
        expect(result.trendWeightKg).toBeGreaterThanOrEqual(20)
        expect(result.trendWeightKg).toBeLessThanOrEqual(400)
        expect(
          Math.abs(result.trendWeightKg * 100 - Math.round(result.trendWeightKg * 100)),
        ).toBeLessThan(1e-6)
        expect(result.completeDaysInWeek).toBeGreaterThanOrEqual(0)
        expect(result.completeDaysInWeek).toBeLessThanOrEqual(7)
        if (result.kind === 'skipped') return
        expect(Number.isInteger(result.maintenanceKcal)).toBe(true)
        expect(result.maintenanceKcal).toBeGreaterThanOrEqual(0)
        expect(result.maintenanceKcal).toBeLessThanOrEqual(20000)
        expect(Number.isInteger(result.rawKcal)).toBe(true)
        expect(Math.abs(result.rawKcal)).toBeLessThanOrEqual(100000)
        const { window } = result
        expect(window === null).toBe(result.method === 'formula')
        if (window === null) return
        expect(window.days).toBeGreaterThanOrEqual(14)
        expect(window.days).toBeLessThanOrEqual(28)
        expect(window.completeDays).toBeGreaterThanOrEqual(4)
        expect(window.completeDays).toBeLessThanOrEqual(window.days)
        expect(Number.isInteger(window.averageIntakeKcal)).toBe(true)
        expect(window.averageIntakeKcal).toBeGreaterThanOrEqual(0)
        expect(window.averageIntakeKcal).toBeLessThanOrEqual(100000)
        expect(Math.abs(window.trendChangeKg)).toBeLessThanOrEqual(380)
        expect(
          Math.abs(window.trendChangeKg * 100 - Math.round(window.trendChangeKg * 100)),
        ).toBeLessThan(1e-6)
      }),
    )
  })
})
