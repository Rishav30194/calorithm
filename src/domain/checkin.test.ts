import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  type CheckinFields,
  type CheckinInput,
  isCheckinDue,
  type PreviousCheckin,
  runCheckin,
  toPrevious,
} from './checkin'
import { addDays } from './dates'
import { activityLevels, type Body, type DayIntake } from './maintenance'
import type { WeighIn } from './trend'

const today = '2026-11-21'
const body: Body = {
  heightCm: 180,
  birthDate: '1996-06-01',
  sex: 'male',
  activityLevel: 'moderate',
}
const settings = { goalRateKgPerWeek: -0.5, proteinGPerKg: 1.8, calorieFloorKcal: 1200 }

const completeDays = (count: number, kcal: number): DayIntake[] =>
  Array.from({ length: count }, (_, i) => ({
    date: addDays(today, i - count),
    kcal,
    complete: true,
  }))

const previous: PreviousCheckin = {
  date: '2026-11-14',
  maintenanceKcal: 2500,
  kcalTarget: 1950,
  proteinTargetG: 145.8,
  trendWeightKg: 81,
  goalRateRequestedKgPerWeek: -0.5,
  goalRateAppliedKgPerWeek: -0.5,
  proteinGPerKg: 1.8,
  calorieFloorKcal: 1200,
  floorApplied: false,
  rateCapped: false,
}

const input = (overrides: Partial<CheckinInput>): CheckinInput => ({
  today,
  weighIns: [{ date: '2026-09-01', kg: 80 }],
  days: completeDays(28, 2200),
  previous: null,
  body,
  settings,
  ...overrides,
})

describe('isCheckinDue', () => {
  it('is due with no check-in yet, or 7 days after the last', () => {
    expect(isCheckinDue(null, today)).toBe(true)
    expect(isCheckinDue('2026-11-15', today)).toBe(false)
    expect(isCheckinDue('2026-11-14', today)).toBe(true)
    expect(isCheckinDue('2026-10-01', today)).toBe(true)
  })
})

describe('runCheckin', () => {
  it('passes a blocked estimate through', () => {
    expect(runCheckin(input({ weighIns: [] }))).toEqual({ kind: 'blocked', reason: 'no_weigh_ins' })
  })

  // Hand-computed: flat 80 kg trend and 2,200 kcal a day give 2,200; minus 550 for −0.5 kg a
  // week is 1,650; protein 1.8 × 80 = 144 g.
  it('combines the estimate and the targets into the stored fields', () => {
    expect(runCheckin(input({}))).toEqual({
      kind: 'ready',
      checkin: {
        date: today,
        status: 'updated',
        skipReason: null,
        method: 'adaptive',
        previousMaintenanceKcal: null,
        rawMaintenanceKcal: 2200,
        maintenanceKcal: 2200,
        kcalTarget: 1650,
        proteinTargetG: 144,
        trendWeightKg: 80,
        trendChangeKg: 0,
        windowDays: 28,
        completeDaysInWindow: 28,
        averageIntakeKcal: 2200,
        completeDaysInWeek: 7,
        goalRateRequestedKgPerWeek: -0.5,
        goalRateAppliedKgPerWeek: -0.5,
        proteinGPerKg: 1.8,
        calorieFloorKcal: 1200,
        floorApplied: false,
        rateCapped: false,
      },
    })
  })

  it('blends from the previous estimate and reports it', () => {
    const result = runCheckin(input({ previous }))
    expect(result).toMatchObject({
      kind: 'ready',
      checkin: { previousMaintenanceKcal: 2500, rawMaintenanceKcal: 2200, maintenanceKcal: 2350 },
    })
  })

  it('carries the previous estimate, targets, and settings through a skipped week', () => {
    const days = completeDays(28, 2200).map((day, i) =>
      i >= 25 ? day : { ...day, complete: i < 21 },
    )
    const result = runCheckin(
      input({ previous, days, settings: { ...settings, calorieFloorKcal: 2000 } }),
    )
    expect(result).toEqual({
      kind: 'ready',
      checkin: {
        date: today,
        status: 'skipped',
        skipReason: 'too_few_complete_days',
        method: null,
        previousMaintenanceKcal: 2500,
        rawMaintenanceKcal: null,
        maintenanceKcal: 2500,
        kcalTarget: 1950,
        proteinTargetG: 145.8,
        trendWeightKg: 81,
        trendChangeKg: null,
        windowDays: null,
        completeDaysInWindow: null,
        averageIntakeKcal: null,
        completeDaysInWeek: 3,
        goalRateRequestedKgPerWeek: -0.5,
        goalRateAppliedKgPerWeek: -0.5,
        proteinGPerKg: 1.8,
        calorieFloorKcal: 1200,
        floorApplied: false,
        rateCapped: false,
      },
    })
  })

  it('applies the safety limits and reports them', () => {
    const result = runCheckin(
      input({ days: completeDays(28, 1500), settings: { ...settings, goalRateKgPerWeek: -1 } }),
    )
    expect(result).toMatchObject({
      kind: 'ready',
      checkin: {
        kcalTarget: 1200,
        floorApplied: true,
        goalRateAppliedKgPerWeek: -0.8,
        rateCapped: true,
      },
    })
  })
})

// The checkins table's cross-column rules, which every stored check-in must satisfy.
const satisfiesTableRules = (row: CheckinFields): void => {
  const updated = row.status === 'updated'
  expect(updated ? row.method !== null && row.skipReason === null : row.method === null).toBe(true)
  expect(updated || row.maintenanceKcal === row.previousMaintenanceKcal).toBe(true)
  expect(updated).toBe(row.rawMaintenanceKcal !== null)
  const window = [
    row.trendChangeKg,
    row.windowDays,
    row.completeDaysInWindow,
    row.averageIntakeKcal,
  ]
  expect(
    window.every((value) => (row.method === 'adaptive' ? value !== null : value === null)),
  ).toBe(true)
  // Single-column ranges and precision.
  const within = (value: number | null, min: number, max: number, places: number) => {
    if (value === null) return
    expect(value).toBeGreaterThanOrEqual(min)
    expect(value).toBeLessThanOrEqual(max)
    expect(Math.abs(value * 10 ** places - Math.round(value * 10 ** places))).toBeLessThan(1e-6)
  }
  within(row.maintenanceKcal, 0, 20000, 0)
  within(row.previousMaintenanceKcal, 0, 20000, 0)
  within(row.rawMaintenanceKcal, -100000, 100000, 0)
  within(row.kcalTarget, 1000, 25000, 0)
  within(row.proteinTargetG, 1, 999.9, 1)
  within(row.trendWeightKg, 20, 400, 2)
  within(row.trendChangeKg, -380, 380, 2)
  within(row.windowDays, 1, 28, 0)
  within(row.completeDaysInWindow, 0, row.windowDays ?? 0, 0)
  within(row.averageIntakeKcal, 0, 100000, 0)
  within(row.completeDaysInWeek, 0, 7, 0)
  within(row.goalRateRequestedKgPerWeek, -2, 2, 2)
  within(row.goalRateAppliedKgPerWeek, -2, 2, 2)
  within(row.proteinGPerKg, 1.6, 2.2, 1)
  within(row.calorieFloorKcal, 1000, 3000, 0)
  if (row.previousMaintenanceKcal !== null) {
    expect(Math.abs(row.maintenanceKcal - row.previousMaintenanceKcal)).toBeLessThanOrEqual(150)
  }
  expect(row.kcalTarget).toBeGreaterThanOrEqual(row.calorieFloorKcal)
  expect(row.kcalTarget).toBeGreaterThanOrEqual(1000)
  expect(row.kcalTarget).toBeLessThanOrEqual(25000)
  expect(!row.floorApplied || row.kcalTarget === row.calorieFloorKcal).toBe(true)
  const applied = Math.round(row.goalRateAppliedKgPerWeek * 100)
  const requested = Math.round(row.goalRateRequestedKgPerWeek * 100)
  expect(Math.abs(applied)).toBeLessThanOrEqual(Math.abs(requested))
  expect(Math.abs(applied) * 100).toBeLessThanOrEqual(Math.round(row.trendWeightKg * 100))
  expect(Math.sign(applied) * Math.sign(requested)).toBeGreaterThanOrEqual(0)
  expect(row.rateCapped).toBe(applied !== requested)
}

describe('runCheckin properties', () => {
  const anySettings = fc.record({
    goalRateKgPerWeek: fc.integer({ min: -200, max: 200 }).map((h) => h / 100),
    proteinGPerKg: fc.integer({ min: 16, max: 22 }).map((t) => t / 10),
    calorieFloorKcal: fc.integer({ min: 1000, max: 3000 }),
  })

  const anyInput = fc.record({
    today: fc.constant(today),
    weighIns: fc
      .array(
        fc.record({
          // Up to 21 days after the first check-in, for the next one.
          offset: fc.integer({ min: -21, max: 60 }),
          kg: fc.integer({ min: 2000, max: 40000 }).map((h) => h / 100),
        }),
        { minLength: 1, maxLength: 30 },
      )
      .map((items): WeighIn[] =>
        items.map(({ offset, kg }) => ({ date: addDays(today, -offset), kg })),
      ),
    days: fc
      .array(fc.record({ kcal: fc.integer({ min: 0, max: 8000 }), complete: fc.boolean() }), {
        minLength: 56,
        maxLength: 56,
      })
      .map((items): DayIntake[] =>
        items.map((item, i) => ({ date: addDays(today, i - 35), ...item })),
      ),
    body: fc.record({
      heightCm: fc.integer({ min: 1000, max: 2500 }).map((t) => t / 10),
      birthDate: fc.constantFrom('1900-01-01', '1990-02-28', '2020-11-21'),
      sex: fc.constantFrom('female' as const, 'male' as const),
      activityLevel: fc.constantFrom(...activityLevels),
    }),
    settings: anySettings,
  })

  it('satisfies every rule of the checkins table, over a chain of check-ins', () => {
    // Each check-in sees only the weigh-ins and days that existed on its date.
    const asOf = (values: CheckinInput, date: string): CheckinInput => ({
      ...values,
      today: date,
      weighIns: values.weighIns.filter((weighIn) => weighIn.date <= date),
      days: values.days.filter((day) => day.date < date),
    })
    fc.assert(
      fc.property(anyInput, anySettings, fc.integer({ min: 7, max: 21 }), (values, later, gap) => {
        const one = runCheckin(asOf({ ...values, previous: null }, today))
        if (one.kind !== 'ready') return
        satisfiesTableRules(one.checkin)
        const next = addDays(today, gap)
        const two = runCheckin(
          asOf({ ...values, settings: later, previous: toPrevious(one.checkin) }, next),
        )
        if (two.kind !== 'ready') return
        expect(two.checkin.date).toBe(next)
        satisfiesTableRules(two.checkin)
      }),
    )
  })
})

// Known answers: 12 weeks built from a chosen maintenance, weighed in daily and logged in full,
// checked in weekly. The last estimate must land within 50 kcal of the chosen value.
type History = {
  maintenanceKcal: number
  startKg: number
  // Intake on day i of the history.
  intake: (day: number) => number
  // Weigh-in noise in kg on day i; water and food make daily weigh-ins swing.
  noise: (day: number) => number
  // Days the user didn't finish logging, with what they logged.
  incomplete?: (day: number) => number | null
  body: Body
}

// A fixed pseudo-random sequence in [−1, 1], so the noisy histories are repeatable.
const noiseSequence = (seed: number) => {
  const values: number[] = []
  let state = seed
  for (let i = 0; i < 100; i++) {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648
    values.push((state / 2_147_483_648) * 2 - 1)
  }
  return (day: number) => values[day % values.length] ?? 0
}

const simulate = (history: History, weeks: number) => {
  const start = addDays(today, -weeks * 7)
  const weighIns: WeighIn[] = []
  const days: DayIntake[] = []
  let kg = history.startKg
  for (let day = 0; day <= weeks * 7; day++) {
    const date = addDays(start, day)
    weighIns.push({ date, kg: Math.round((kg + history.noise(day)) * 100) / 100 })
    const eaten = history.intake(day)
    const logged = history.incomplete?.(day) ?? null
    days.push({ date, kcal: logged ?? eaten, complete: logged === null })
    kg += (eaten - history.maintenanceKcal) / 7700
  }

  const estimates: number[] = []
  let last: CheckinFields | null = null
  for (let week = 1; week <= weeks; week++) {
    const date = addDays(start, week * 7)
    const result = runCheckin({
      today: date,
      weighIns: weighIns.filter((weighIn) => weighIn.date <= date),
      days: days.filter((day) => day.date < date),
      previous: last === null ? null : toPrevious(last),
      body: history.body,
      settings,
    })
    if (result.kind !== 'ready') throw new Error(`check-in blocked: ${result.reason}`)
    last = result.checkin
    estimates.push(last.maintenanceKcal)
  }
  return estimates
}

describe('known answers over 12 weeks', () => {
  const quiet = () => 0
  // A weekly pattern: lighter weekdays, heavier weekends.
  const weekly = (base: number) => (day: number) =>
    base + ([-150, -100, -50, 0, 50, 100, 150][day % 7] ?? 0)

  const histories: Record<string, History> = {
    'steady loss, formula 160 kcal high': {
      maintenanceKcal: 2600,
      startKg: 80,
      intake: weekly(2100),
      noise: quiet,
      body,
    },
    'maintenance, formula 660 kcal high': {
      maintenanceKcal: 2100,
      startKg: 80,
      intake: () => 2100,
      noise: quiet,
      body,
    },
    'gain, formula 609 kcal low': {
      maintenanceKcal: 2800,
      startKg: 60,
      intake: weekly(3300),
      noise: quiet,
      body: { heightCm: 165, birthDate: '1986-03-10', sex: 'female', activityLevel: 'active' },
    },
    'loss with ±0.8 kg daily noise': {
      maintenanceKcal: 2450,
      startKg: 95,
      intake: weekly(1950),
      noise: (day) => 0.8 * noiseSequence(7)(day),
      body: { ...body, activityLevel: 'light' },
    },
    'loss with noise and under-logged incomplete days': {
      maintenanceKcal: 2300,
      startKg: 72,
      intake: weekly(1900),
      noise: (day) => 0.6 * noiseSequence(42)(day),
      incomplete: (day) => (day % 5 === 0 ? 900 : null),
      body: { heightCm: 170, birthDate: '1980-01-15', sex: 'female', activityLevel: 'active' },
    },
  }

  it.each(Object.entries(histories))('%s: within 50 kcal by week 12', (_, history) => {
    const estimates = simulate(history, 12)
    expect(estimates).toHaveLength(12)
    expect(Math.abs((estimates.at(-1) ?? 0) - history.maintenanceKcal)).toBeLessThanOrEqual(50)
  })
})
