import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  cmFromFeetAndInches,
  feetAndInchesFromCm,
  goalRateFromKg,
  goalRateToKg,
  type ProfileSettings,
  profileErrors,
  proteinOptions,
} from './profile'

const today = '2026-11-21'

const valid: ProfileSettings = {
  heightCm: 180,
  birthDate: '1996-06-01',
  sex: 'male',
  activityLevel: 'moderate',
  goalRateKgPerWeek: -0.5,
  proteinGPerKg: 1.8,
  calorieFloorKcal: 1200,
}

describe('height in feet and inches', () => {
  // Hand-computed: 5 ft 10 in is 70 in × 2.54 = 177.8 cm.
  it('converts to centimeters with one decimal', () => {
    expect(cmFromFeetAndInches(5, 10)).toBe(177.8)
    expect(cmFromFeetAndInches(6, 0)).toBe(182.9)
  })

  it('shows centimeters as the nearest whole inch', () => {
    expect(feetAndInchesFromCm(177.8)).toEqual({ feet: 5, inches: 10 })
    expect(feetAndInchesFromCm(180)).toEqual({ feet: 5, inches: 11 })
    expect(feetAndInchesFromCm(182.8)).toEqual({ feet: 6, inches: 0 })
  })

  it('shows back the feet and inches entered', () => {
    fc.assert(
      fc.property(fc.integer({ min: 40, max: 98 }), (totalInches) => {
        const feet = Math.floor(totalInches / 12)
        const inches = totalInches % 12
        expect(feetAndInchesFromCm(cmFromFeetAndInches(feet, inches))).toEqual({ feet, inches })
      }),
    )
  })
})

describe('goal rate', () => {
  it('signs the amount by direction, in kg with two decimals', () => {
    expect(goalRateToKg('lose', 0.5, 'kg')).toBe(-0.5)
    expect(goalRateToKg('gain', 0.25, 'kg')).toBe(0.25)
    expect(goalRateToKg('maintain', 0.5, 'kg')).toBe(0)
    // 1 lb is 0.45359237 kg.
    expect(goalRateToKg('lose', 1, 'lb')).toBe(-0.45)
  })

  it('splits a stored rate into direction and amount in the unit', () => {
    expect(goalRateFromKg(-0.5, 'kg')).toEqual({ direction: 'lose', amount: 0.5 })
    expect(goalRateFromKg(0.25, 'kg')).toEqual({ direction: 'gain', amount: 0.25 })
    expect(goalRateFromKg(0, 'kg')).toEqual({ direction: 'maintain', amount: 0 })
    expect(goalRateFromKg(-0.45, 'lb')).toEqual({ direction: 'lose', amount: 1 })
  })

  it('shows back a pound amount entered with one decimal', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 44 }), fc.boolean(), (tenths, losing) => {
        const direction = losing ? 'lose' : 'gain'
        const kg = goalRateToKg(direction, tenths / 10, 'lb')
        expect(goalRateFromKg(kg, 'lb')).toEqual({ direction, amount: tenths / 10 })
      }),
    )
  })
})

describe('profileErrors', () => {
  it('accepts a complete, valid profile, and one with the body fields left empty', () => {
    expect(profileErrors(valid, today)).toEqual([])
    expect(
      profileErrors(
        { ...valid, heightCm: null, birthDate: null, sex: null, activityLevel: null },
        today,
      ),
    ).toEqual([])
  })

  // Each matches a check in the profile migration.
  it.each([
    ['heightCm', { heightCm: 99.9 }],
    ['heightCm', { heightCm: 250.1 }],
    ['heightCm', { heightCm: 180.25 }],
    ['birthDate', { birthDate: '1899-12-31' }],
    ['birthDate', { birthDate: '2026-11-22' }],
    ['birthDate', { birthDate: '2027-02-29' }],
    ['goalRateKgPerWeek', { goalRateKgPerWeek: -2.01 }],
    ['goalRateKgPerWeek', { goalRateKgPerWeek: 0.505 }],
    ['proteinGPerKg', { proteinGPerKg: 1.5 }],
    ['proteinGPerKg', { proteinGPerKg: 1.85 }],
    ['calorieFloorKcal', { calorieFloorKcal: 999 }],
    ['calorieFloorKcal', { calorieFloorKcal: 3001 }],
    ['calorieFloorKcal', { calorieFloorKcal: 1200.5 }],
  ] as const)('flags %s for %o', (field, change) => {
    expect(profileErrors({ ...valid, ...change }, today)).toEqual([field])
  })

  it('accepts the ends of each range, and today as a birth date', () => {
    expect(
      profileErrors(
        { ...valid, heightCm: 100, birthDate: today, goalRateKgPerWeek: 2, calorieFloorKcal: 3000 },
        today,
      ),
    ).toEqual([])
    expect(
      profileErrors(
        {
          ...valid,
          heightCm: 250,
          birthDate: '1900-01-01',
          goalRateKgPerWeek: -2,
          calorieFloorKcal: 1000,
        },
        today,
      ),
    ).toEqual([])
  })

  it('offers each protein setting the profile accepts', () => {
    expect(proteinOptions).toEqual([1.6, 1.7, 1.8, 1.9, 2, 2.1, 2.2])
    for (const proteinGPerKg of proteinOptions) {
      expect(profileErrors({ ...valid, proteinGPerKg }, today)).toEqual([])
    }
  })
})
