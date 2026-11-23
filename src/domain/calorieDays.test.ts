import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  type CalorieDays,
  dayTargets,
  higherDayCount,
  kcalTargetOn,
  MAX_HIGHER_DAYS,
  MAX_HIGHER_DAYS_MASK,
  MAX_HIGHER_KCAL_EXTRA,
  maxExtraKcal,
  weekTargets,
} from './calorieDays'

const weekend: CalorieDays = { days: 0b1100000, extraKcal: 400 }
const none: CalorieDays = { days: 0, extraKcal: 0 }

describe('weekTargets', () => {
  it('gives the chosen days the extra and spreads the cost over the others', () => {
    expect(weekTargets(2000, 1200, weekend)).toEqual({
      kcal: [1840, 1840, 1840, 1840, 1840, 2400, 2400],
      extraKcal: 400,
      trimmed: false,
    })
  })

  it('takes a remainder from the earliest lower days, keeping the week’s total exact', () => {
    // Saturday at +100 costs 100 kcal over six days: 16 each, with 4 left for Monday to Thursday.
    const result = weekTargets(2000, 1200, { days: 0b0100000, extraKcal: 100 })
    expect(result.kcal).toEqual([1983, 1983, 1983, 1983, 1984, 2100, 1984])
  })

  it('leaves every day at the target when no day is chosen or the extra is 0', () => {
    expect(weekTargets(2000, 1200, none).kcal).toEqual(Array(7).fill(2000))
    expect(weekTargets(2000, 1200, { days: weekend.days, extraKcal: 0 }).kcal).toEqual(
      Array(7).fill(2000),
    )
  })

  it('trims an extra the floor no longer allows, and says so', () => {
    // At 1300 kcal with a 1200 floor, five lower days can give 500 in all: 250 to each of two.
    expect(weekTargets(1300, 1200, weekend)).toEqual({
      kcal: [1200, 1200, 1200, 1200, 1200, 1550, 1550],
      extraKcal: 250,
      trimmed: true,
    })
  })

  it('keeps the week’s total and the floor for any setting', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: 25_000 }),
        fc.integer({ min: 1000, max: 3000 }),
        fc.integer({ min: 0, max: 127 }),
        fc.integer({ min: 0, max: 5000 }),
        (target, floor, days, extraKcal) => {
          fc.pre(target >= floor)
          const { kcal } = weekTargets(target, floor, { days, extraKcal })
          expect(kcal.reduce((sum, day) => sum + day, 0)).toBe(7 * target)
          for (const day of kcal) {
            expect(Number.isInteger(day)).toBe(true)
            expect(day).toBeGreaterThanOrEqual(floor)
          }
        },
      ),
    )
  })

  it('ignores a choice of all seven days, which would leave no day to give', () => {
    expect(weekTargets(2000, 1200, { days: 127, extraKcal: 300 }).kcal).toEqual(Array(7).fill(2000))
  })
})

describe('maxExtraKcal', () => {
  it('is what the lower days can give above the floor, shared by the higher days', () => {
    // Five lower days with 800 above the floor give 4000, shared by two days.
    expect(maxExtraKcal(2000, 1200, 2)).toBe(2000)
    expect(maxExtraKcal(2000, 1200, 3)).toBe(1066)
  })

  it('is 0 with no higher days, all seven, or a target at the floor', () => {
    expect(maxExtraKcal(2000, 1200, 0)).toBe(0)
    expect(maxExtraKcal(2000, 1200, 7)).toBe(0)
    expect(maxExtraKcal(1200, 1200, 2)).toBe(0)
  })
})

describe('higherDayCount', () => {
  it('counts the chosen weekdays', () => {
    expect(higherDayCount(weekend.days)).toBe(2)
    expect(higherDayCount(0)).toBe(0)
    expect(higherDayCount(127)).toBe(7)
    expect(MAX_HIGHER_DAYS).toBe(6)
  })
})

describe('kcalTargetOn', () => {
  it('gives a day its weekday’s target', () => {
    // 2026-11-28 is a Saturday, 2026-11-23 a Monday.
    expect(kcalTargetOn('2026-11-28', 2000, 1200, weekend)).toBe(2400)
    expect(kcalTargetOn('2026-11-23', 2000, 1200, weekend)).toBe(1840)
  })
})

describe('trimming at the floor', () => {
  it('says the extra was trimmed to nothing when the target sits on the floor', () => {
    expect(weekTargets(1200, 1200, weekend)).toEqual({
      kcal: Array(7).fill(1200),
      extraKcal: 0,
      trimmed: true,
    })
  })
})

describe('the stored setting’s ranges', () => {
  it('allows any six days but never all seven', () => {
    expect(higherDayCount(MAX_HIGHER_DAYS_MASK)).toBe(MAX_HIGHER_DAYS)
    expect(higherDayCount(MAX_HIGHER_DAYS_MASK + 1)).toBe(7)
    // Every mask of six days is within the range.
    for (let left = 0; left < 7; left += 1) {
      expect(127 - (1 << left)).toBeLessThanOrEqual(MAX_HIGHER_DAYS_MASK)
    }
    expect(MAX_HIGHER_KCAL_EXTRA).toBe(5000)
  })
})

describe('dayTargets', () => {
  const plan = { kcalTarget: 2000, proteinTargetG: 150, floorKcal: 1200, calorieDays: weekend }

  it('gives a day its weekday’s kcal and the same protein every day', () => {
    expect(dayTargets(plan, '2026-11-28')).toEqual({ kcal: 2400, proteinG: 150, trimmed: false })
    expect(dayTargets(plan, '2026-11-23')).toEqual({ kcal: 1840, proteinG: 150, trimmed: false })
  })

  it('says when the floor trimmed the week', () => {
    expect(dayTargets({ ...plan, kcalTarget: 1300 }, '2026-11-28')).toEqual({
      kcal: 1550,
      proteinG: 150,
      trimmed: true,
    })
  })

  it('gives every day the check-in’s target with no days chosen', () => {
    expect(dayTargets({ ...plan, calorieDays: none }, '2026-11-28')).toEqual({
      kcal: 2000,
      proteinG: 150,
      trimmed: false,
    })
  })
})
