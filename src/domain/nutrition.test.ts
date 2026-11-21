import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  type Entry,
  isMeal,
  meals,
  mostUsed,
  recipeEntryNutrients,
  recipePerServing,
  recipeTotals,
  roundKcal,
  roundProtein,
  roundServings,
  scaleNutrients,
  sumNutrients,
  totalsByMeal,
} from './nutrition'

const decimalsOf = (value: number): number => {
  const [, fraction = ''] = String(value).split('.')
  return fraction.length
}

const servings = fc.integer({ min: 1, max: 100_000 }).map((hundredths) => hundredths / 100)
const perServing = fc.record({
  kcal: fc.integer({ min: 0, max: 10_000 }),
  proteinG: fc.integer({ min: 0, max: 10_000 }).map((tenths) => tenths / 10),
})

describe('rounding at the storage boundary', () => {
  it('rounds kcal to a whole number, protein to one decimal, and servings to two', () => {
    expect(roundKcal(195.00000000000003)).toBe(195)
    expect(roundKcal(12.5)).toBe(13)
    expect(roundProtein(7.25)).toBe(7.3)
    expect(roundProtein(0.1 + 0.2)).toBe(0.3)
    expect(roundServings(1.005)).toBe(1.01)
    expect(roundServings(0.333333)).toBe(0.33)
  })

  it('never leaves more decimals than the column stores, nor moves a value by more than half a step', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 100_000, noNaN: true }), (value) => {
        expect(Number.isInteger(roundKcal(value))).toBe(true)
        expect(decimalsOf(roundProtein(value))).toBeLessThanOrEqual(1)
        expect(decimalsOf(roundServings(value))).toBeLessThanOrEqual(2)
        expect(Math.abs(roundKcal(value) - value)).toBeLessThanOrEqual(0.5 + 1e-9)
        expect(Math.abs(roundProtein(value) - value)).toBeLessThanOrEqual(0.05 + 1e-9)
        expect(Math.abs(roundServings(value) - value)).toBeLessThanOrEqual(0.005 + 1e-9)
      }),
    )
  })
})

describe('scaleNutrients', () => {
  it('multiplies per-serving values by the servings logged', () => {
    expect(scaleNutrients({ kcal: 150, proteinG: 5 }, 1.3)).toEqual({ kcal: 195, proteinG: 6.5 })
    expect(scaleNutrients({ kcal: 100, proteinG: 17 }, 0.5)).toEqual({ kcal: 50, proteinG: 8.5 })
  })

  it('gives storable values that grow with the servings', () => {
    fc.assert(
      fc.property(perServing, servings, servings, (food, a, b) => {
        const small = scaleNutrients(food, Math.min(a, b))
        const large = scaleNutrients(food, Math.max(a, b))
        expect(Number.isInteger(small.kcal)).toBe(true)
        expect(decimalsOf(small.proteinG)).toBeLessThanOrEqual(1)
        expect(large.kcal).toBeGreaterThanOrEqual(small.kcal)
        expect(large.proteinG).toBeGreaterThanOrEqual(small.proteinG)
      }),
    )
  })
})

describe('recipes', () => {
  const porridge = [
    { perServing: { kcal: 150, proteinG: 5 }, servings: 2 }, // oats
    { perServing: { kcal: 65, proteinG: 3.4 }, servings: 3 }, // milk
  ]

  it('totals the ingredients', () => {
    expect(recipeTotals(porridge)).toEqual({ kcal: 495, proteinG: 20.2 })
  })

  it('logs a fraction of the recipe from its exact totals, rounding once', () => {
    // 495 kcal makes 4 servings; half a serving is 61.875 kcal.
    expect(recipeEntryNutrients(porridge, 4, 0.5)).toEqual({ kcal: 62, proteinG: 2.5 })
  })

  it('gives unrounded per-serving values to store with an entry', () => {
    expect(recipePerServing(porridge, 4)).toEqual({ kcal: 123.75, proteinG: 5.05 })
  })

  it('scaling the per-serving values gives the same entry as logging directly', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ perServing, servings }), { maxLength: 20 }),
        servings,
        servings,
        (ingredients, made, logged) => {
          expect(scaleNutrients(recipePerServing(ingredients, made), logged)).toEqual(
            recipeEntryNutrients(ingredients, made, logged),
          )
        },
      ),
    )
  })

  it('logging every serving gives the recipe’s totals', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ perServing, servings }), { maxLength: 20 }),
        servings,
        (ingredients, made) => {
          expect(recipeEntryNutrients(ingredients, made, made)).toEqual(recipeTotals(ingredients))
        },
      ),
    )
  })
})

const entry = (overrides: Partial<Entry> = {}): Entry => ({
  date: '2026-11-20',
  meal: 'breakfast',
  source: { kind: 'food', id: 'oats' },
  name: 'Oats',
  servings: 1,
  kcal: 150,
  proteinG: 5,
  ...overrides,
})

describe('totals', () => {
  it('sums kcal and protein without float drift', () => {
    expect(
      sumNutrients([
        { kcal: 1, proteinG: 0.1 },
        { kcal: 2, proteinG: 0.2 },
      ]),
    ).toEqual({ kcal: 3, proteinG: 0.3 })
    expect(sumNutrients([])).toEqual({ kcal: 0, proteinG: 0 })
  })

  it('splits a day by meal, with every meal present', () => {
    const totals = totalsByMeal([
      entry({ meal: 'breakfast', kcal: 150, proteinG: 5 }),
      entry({ meal: 'breakfast', kcal: 100, proteinG: 17 }),
      entry({ meal: 'dinner', kcal: 600, proteinG: 40.5 }),
    ])
    expect(totals).toEqual({
      breakfast: { kcal: 250, proteinG: 22 },
      lunch: { kcal: 0, proteinG: 0 },
      dinner: { kcal: 600, proteinG: 40.5 },
      snacks: { kcal: 0, proteinG: 0 },
    })
  })

  it('meal totals add up to the day’s total', () => {
    const arbitraryEntry = fc.record({
      meal: fc.constantFrom(...meals),
      kcal: fc.integer({ min: 0, max: 5_000 }),
      proteinG: fc.integer({ min: 0, max: 5_000 }).map((tenths) => tenths / 10),
    })
    fc.assert(
      fc.property(fc.array(arbitraryEntry, { maxLength: 50 }), (entries) => {
        const byMeal = totalsByMeal(entries.map((e) => entry(e)))
        expect(sumNutrients(Object.values(byMeal))).toEqual(sumNutrients(entries))
      }),
    )
  })
})

describe('mostUsed', () => {
  it('ranks by times logged, then by most recent, then by name', () => {
    const oats = { kind: 'food', id: 'oats' } as const
    const yogurt = { kind: 'food', id: 'yogurt' } as const
    const chili = { kind: 'recipe', id: 'chili' } as const
    const apple = { kind: 'food', id: 'apple' } as const
    const ranked = mostUsed(
      [
        entry({ source: oats, name: 'Oats', date: '2026-11-18' }),
        entry({ source: oats, name: 'Oats', date: '2026-11-19' }),
        entry({ source: yogurt, name: 'Yogurt', date: '2026-11-20' }),
        entry({ source: chili, name: 'Chili', date: '2026-11-17' }),
        entry({ source: apple, name: 'Apple', date: '2026-11-17' }),
      ],
      10,
    )
    expect(ranked.map((pick) => pick.source.id)).toEqual(['oats', 'yogurt', 'apple', 'chili'])
    expect(ranked[0]).toEqual({ source: oats, name: 'Oats', servings: 1, count: 2 })
  })

  it('offers the servings from the latest time each was logged', () => {
    const ranked = mostUsed(
      [entry({ date: '2026-11-18', servings: 2 }), entry({ date: '2026-11-19', servings: 1.5 })],
      10,
    )
    expect(ranked[0]?.servings).toBe(1.5)
  })

  it('on one day, offers the later entry’s servings', () => {
    const ranked = mostUsed(
      [entry({ meal: 'breakfast', servings: 1 }), entry({ meal: 'dinner', servings: 2 })],
      10,
    )
    expect(ranked[0]?.servings).toBe(2)
  })

  it('returns at most the limit, each source once', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.constantFrom('a', 'b', 'c', 'd', 'e'),
            date: fc.constantFrom('2026-11-18', '2026-11-19', '2026-11-20'),
          }),
          { maxLength: 40 },
        ),
        fc.integer({ min: 0, max: 6 }),
        (logged, limit) => {
          const ranked = mostUsed(
            logged.map(({ id, date }) => entry({ source: { kind: 'food', id }, name: id, date })),
            limit,
          )
          const ids = ranked.map((pick) => pick.source.id)
          expect(ids.length).toBeLessThanOrEqual(limit)
          expect(new Set(ids).size).toBe(ids.length)
          for (let i = 1; i < ranked.length; i++) {
            expect(ranked[i - 1]?.count ?? 0).toBeGreaterThanOrEqual(ranked[i]?.count ?? 0)
          }
        },
      ),
    )
  })
})

describe('isMeal', () => {
  it('accepts the four meals only', () => {
    expect(meals.every(isMeal)).toBe(true)
    expect(isMeal('brunch')).toBe(false)
  })
})
