import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { entryFits, limits } from './limits'
import type { Nutrients } from './nutrition'
import { scaleNutrients } from './nutrition'

const food = (overrides: Partial<Nutrients> = {}): Nutrients => ({
  kcal: 80,
  proteinG: 2,
  carbsG: 80,
  fatG: 1,
  ...overrides,
})

describe('entryFits', () => {
  it('accepts an everyday entry', () => {
    expect(entryFits(food(), 2)).toBe(true)
  })

  it('refuses a total past the carbs limit', () => {
    // 200 servings of an 80 g-carbs food is 16000 g, over the 10000 g a log entry holds.
    expect(entryFits(food(), 200)).toBe(false)
  })

  it('accepts a total exactly at a limit', () => {
    expect(entryFits(food({ carbsG: 100 }), 100)).toBe(true)
    expect(entryFits(food({ kcal: 100, proteinG: 10, carbsG: 10, fatG: 10 }), 1_000)).toBe(true)
  })

  it('refuses kcal and protein past their limits', () => {
    expect(entryFits(food({ kcal: 1_000 }), 101)).toBe(false)
    expect(entryFits(food({ proteinG: 100 }), 101)).toBe(false)
  })

  it('refuses fat past its limit', () => {
    expect(entryFits(food({ fatG: 100 }), 101)).toBe(false)
  })

  it('ignores carbs and fat that are not set', () => {
    expect(entryFits(food({ carbsG: null, fatG: null }), 1_000)).toBe(true)
  })

  it('refuses servings outside 0.01 to 1000', () => {
    expect(entryFits(food(), 0)).toBe(false)
    expect(entryFits(food(), 0.001)).toBe(false)
    expect(entryFits(food(), 1_000.01)).toBe(false)
  })

  it('refuses a recipe serving past the per-serving limits', () => {
    expect(entryFits(food({ kcal: limits.entry.kcal + 1 }), 0.5)).toBe(false)
  })

  it('agrees with the stored totals for any food the form accepts', () => {
    const grams = fc.integer({ min: 0, max: limits.food.grams * 10 }).map((tenths) => tenths / 10)
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: limits.food.kcal }),
        grams,
        fc.option(grams),
        fc.option(grams),
        fc.integer({ min: 1, max: limits.servings * 100 }).map((hundredths) => hundredths / 100),
        (kcal, proteinG, carbsG, fatG, servings) => {
          const perServing = { kcal, proteinG, carbsG, fatG }
          const total = scaleNutrients(perServing, servings)
          const within =
            total.kcal <= limits.entry.kcal &&
            total.proteinG <= limits.entry.grams &&
            (total.carbsG ?? 0) <= limits.entry.grams &&
            (total.fatG ?? 0) <= limits.entry.grams
          expect(entryFits(perServing, servings)).toBe(within)
        },
      ),
    )
  })
})
