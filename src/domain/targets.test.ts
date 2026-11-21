import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { type TargetInput, targets } from './targets'

const base: TargetInput = {
  maintenanceKcal: 2500,
  goalRateKgPerWeek: -0.5,
  trendWeightKg: 82,
  proteinGPerKg: 1.8,
  calorieFloorKcal: 1200,
}

// Every input the profile, weights, and checkins tables accept.
const input = fc.record({
  maintenanceKcal: fc.integer({ min: 0, max: 20000 }),
  goalRateKgPerWeek: fc.integer({ min: -200, max: 200 }).map((h) => h / 100),
  trendWeightKg: fc.integer({ min: 2000, max: 40000 }).map((h) => h / 100),
  proteinGPerKg: fc.integer({ min: 16, max: 22 }).map((t) => t / 10),
  calorieFloorKcal: fc.integer({ min: 1000, max: 3000 }),
})

describe('targets', () => {
  // Hand-computed: 2,500 + (−0.5 × 7,700 ÷ 7) = 2,500 − 550 = 1,950 kcal; 1.8 × 82 = 147.6 g.
  it('sets kcal from maintenance and the goal rate, and protein from trend weight', () => {
    expect(targets(base)).toEqual({
      kcal: 1950,
      proteinG: 147.6,
      appliedRateKgPerWeek: -0.5,
      rateCapped: false,
      floorApplied: false,
    })
  })

  // Hand-computed: 1% of 60 kg is 0.6 kg a week; 2,400 − 0.6 × 1,100 = 1,740 kcal.
  it('caps the goal rate at 1% of trend weight a week, for losing or gaining', () => {
    expect(
      targets({ ...base, maintenanceKcal: 2400, trendWeightKg: 60, goalRateKgPerWeek: -1 }),
    ).toMatchObject({
      kcal: 1740,
      appliedRateKgPerWeek: -0.6,
      rateCapped: true,
    })
    expect(
      targets({ ...base, maintenanceKcal: 2400, trendWeightKg: 60, goalRateKgPerWeek: 1 }),
    ).toMatchObject({
      kcal: 3060,
      appliedRateKgPerWeek: 0.6,
      rateCapped: true,
    })
  })

  // 1% of 82.45 kg is 0.8245; the cap rounds down to 0.82 so it never exceeds 1%.
  it('rounds the cap down to whole hundredths', () => {
    expect(
      targets({ ...base, trendWeightKg: 82.45, goalRateKgPerWeek: -1 }).appliedRateKgPerWeek,
    ).toBe(-0.82)
  })

  // Hand-computed: 1,500 − 550 = 950, below the 1,200 floor.
  it('raises a target below the calorie floor to the floor', () => {
    expect(targets({ ...base, maintenanceKcal: 1500 })).toMatchObject({
      kcal: 1200,
      floorApplied: true,
    })
  })

  it('reports both limits when both apply', () => {
    expect(
      targets({ ...base, maintenanceKcal: 1300, trendWeightKg: 50, goalRateKgPerWeek: -1 }),
    ).toMatchObject({
      kcal: 1200,
      appliedRateKgPerWeek: -0.5,
      rateCapped: true,
      floorApplied: true,
    })
  })

  it('keeps maintenance at a goal rate of zero', () => {
    expect(targets({ ...base, goalRateKgPerWeek: 0 })).toMatchObject({
      kcal: 2500,
      appliedRateKgPerWeek: 0,
      rateCapped: false,
    })
  })

  it('never sets a target below the calorie floor', () => {
    fc.assert(
      fc.property(input, (values) => {
        expect(targets(values).kcal).toBeGreaterThanOrEqual(values.calorieFloorKcal)
      }),
    )
  })

  it('never applies a rate above 1% of trend weight a week, or faster than requested', () => {
    fc.assert(
      fc.property(input, (values) => {
        const { appliedRateKgPerWeek: applied } = targets(values)
        // Hundredths as integers, as the database compares them.
        expect(Math.abs(Math.round(applied * 100)) * 100).toBeLessThanOrEqual(
          Math.round(values.trendWeightKg * 100),
        )
        expect(Math.abs(applied)).toBeLessThanOrEqual(Math.abs(values.goalRateKgPerWeek))
        expect(Math.sign(applied) * Math.sign(values.goalRateKgPerWeek)).toBeGreaterThanOrEqual(0)
      }),
    )
  })

  it('reports a limit exactly when it changed the target', () => {
    fc.assert(
      fc.property(input, (values) => {
        const result = targets(values)
        expect(result.rateCapped).toBe(result.appliedRateKgPerWeek !== values.goalRateKgPerWeek)
        const unfloored = Math.round(values.maintenanceKcal + result.appliedRateKgPerWeek * 1100)
        expect(result.floorApplied).toBe(unfloored < values.calorieFloorKcal)
        expect(result.kcal).toBe(result.floorApplied ? values.calorieFloorKcal : unfloored)
      }),
    )
  })

  it('scales protein linearly with trend weight', () => {
    fc.assert(
      fc.property(input, fc.integer({ min: 2, max: 4 }), (values, factor) => {
        fc.pre(values.trendWeightKg * factor <= 400)
        const one = targets(values).proteinG
        const many = targets({ ...values, trendWeightKg: values.trendWeightKg * factor }).proteinG
        // Each result is rounded to 0.1 g, so the scaled one can differ by the rounding alone.
        expect(Math.abs(many - one * factor)).toBeLessThanOrEqual(0.05 * factor + 0.05 + 1e-9)
      }),
    )
  })

  it('returns integer kcal and protein with one decimal, within the checkins ranges', () => {
    fc.assert(
      fc.property(input, (values) => {
        const { kcal, proteinG, appliedRateKgPerWeek } = targets(values)
        expect(Number.isInteger(kcal)).toBe(true)
        expect(kcal).toBeLessThanOrEqual(25000)
        expect(Math.abs(proteinG * 10 - Math.round(proteinG * 10))).toBeLessThan(1e-6)
        expect(proteinG).toBeGreaterThanOrEqual(1)
        expect(proteinG).toBeLessThanOrEqual(999.9)
        expect(
          Math.abs(appliedRateKgPerWeek * 100 - Math.round(appliedRateKgPerWeek * 100)),
        ).toBeLessThan(1e-6)
      }),
    )
  })
})
