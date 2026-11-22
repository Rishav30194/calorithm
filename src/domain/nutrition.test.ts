import fc from 'fast-check'
import { describe, expect, expectTypeOf, it } from 'vitest'

import { addDays } from './dates'
import {
  type Entry,
  isMeal,
  meals,
  missingCarbsOrFat,
  mostUsed,
  type QuickPick,
  recentPicks,
  recipeEntryNutrients,
  recipePerServing,
  recipeTotals,
  roundGrams,
  roundKcal,
  roundProtein,
  roundServings,
  scaleNutrients,
  sourceKey,
  sumNutrients,
  totalsByMeal,
  useScores,
} from './nutrition'

const decimalsOf = (value: number): number => {
  const [, fraction = ''] = String(value).split('.')
  return fraction.length
}

const servings = fc.integer({ min: 1, max: 100_000 }).map((hundredths) => hundredths / 100)
const grams = fc.integer({ min: 0, max: 10_000 }).map((tenths) => tenths / 10)
// Carbs and fat may be not set (null), as on foods saved before they existed.
const perServing = fc.record({
  kcal: fc.integer({ min: 0, max: 10_000 }),
  proteinG: grams,
  carbsG: fc.option(grams, { nil: null }),
  fatG: fc.option(grams, { nil: null }),
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
    expect(scaleNutrients({ kcal: 150, proteinG: 5, carbsG: null, fatG: null }, 1.3)).toEqual({
      kcal: 195,
      proteinG: 6.5,
      carbsG: null,
      fatG: null,
    })
    expect(scaleNutrients({ kcal: 100, proteinG: 17, carbsG: null, fatG: null }, 0.5)).toEqual({
      kcal: 50,
      proteinG: 8.5,
      carbsG: null,
      fatG: null,
    })
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
    { perServing: { kcal: 150, proteinG: 5, carbsG: null, fatG: null }, servings: 2 }, // oats
    { perServing: { kcal: 65, proteinG: 3.4, carbsG: null, fatG: null }, servings: 3 }, // milk
  ]

  it('totals the ingredients', () => {
    expect(recipeTotals(porridge)).toEqual({ kcal: 495, proteinG: 20.2, carbsG: null, fatG: null })
  })

  it('logs a fraction of the recipe from its exact totals, rounding once', () => {
    // 495 kcal makes 4 servings; half a serving is 61.875 kcal.
    expect(recipeEntryNutrients(porridge, 4, 0.5)).toEqual({
      kcal: 62,
      proteinG: 2.5,
      carbsG: null,
      fatG: null,
    })
  })

  it('gives unrounded per-serving values to store with an entry', () => {
    expect(recipePerServing(porridge, 4)).toEqual({
      kcal: 123.75,
      proteinG: 5.05,
      carbsG: null,
      fatG: null,
    })
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
  carbsG: null,
  fatG: null,
  ...overrides,
})

describe('totals', () => {
  it('sums kcal and protein without float drift', () => {
    expect(
      sumNutrients([
        { kcal: 1, proteinG: 0.1, carbsG: null, fatG: null },
        { kcal: 2, proteinG: 0.2, carbsG: null, fatG: null },
      ]),
    ).toEqual({ kcal: 3, proteinG: 0.3, carbsG: null, fatG: null })
    expect(sumNutrients([])).toEqual({ kcal: 0, proteinG: 0, carbsG: null, fatG: null })
  })

  it('splits a day by meal, with every meal present', () => {
    const totals = totalsByMeal([
      entry({ meal: 'breakfast', kcal: 150, proteinG: 5 }),
      entry({ meal: 'breakfast', kcal: 100, proteinG: 17 }),
      entry({ meal: 'dinner', kcal: 600, proteinG: 40.5 }),
    ])
    expect(totals).toEqual({
      breakfast: { kcal: 250, proteinG: 22, carbsG: null, fatG: null },
      lunch: { kcal: 0, proteinG: 0, carbsG: null, fatG: null },
      dinner: { kcal: 600, proteinG: 40.5, carbsG: null, fatG: null },
      snacks: { kcal: 0, proteinG: 0, carbsG: null, fatG: null },
    })
  })

  it('meal totals add up to the day’s total', () => {
    const arbitraryEntry = fc.record({
      meal: fc.constantFrom(...meals),
      kcal: fc.integer({ min: 0, max: 5_000 }),
      proteinG: fc.integer({ min: 0, max: 5_000 }).map((tenths) => tenths / 10),
      carbsG: fc.option(grams, { nil: null }),
      fatG: fc.option(grams, { nil: null }),
    })
    fc.assert(
      fc.property(fc.array(arbitraryEntry, { maxLength: 50 }), (entries) => {
        const byMeal = totalsByMeal(entries.map((e) => entry(e)))
        expect(sumNutrients(Object.values(byMeal))).toEqual(sumNutrients(entries))
      }),
    )
  })
})

describe('carbs and fat (decision 0025)', () => {
  const oats = { kcal: 150, proteinG: 5, carbsG: 27, fatG: 2.5 }
  const unset = { kcal: 100, proteinG: 10, carbsG: null, fatG: null }

  it('rounds grams to one decimal, as protein', () => {
    expect(roundGrams(2.25)).toBe(2.3)
    expect(roundGrams(27.04)).toBe(27)
  })

  it('scales carbs and fat with the servings, and keeps not set as not set', () => {
    expect(scaleNutrients(oats, 1.5)).toEqual({ kcal: 225, proteinG: 7.5, carbsG: 40.5, fatG: 3.8 })
    expect(scaleNutrients(unset, 2)).toEqual({ kcal: 200, proteinG: 20, carbsG: null, fatG: null })
  })

  it('sums the known values when some items have carbs or fat not set', () => {
    expect(sumNutrients([oats, unset])).toEqual({ kcal: 250, proteinG: 15, carbsG: 27, fatG: 2.5 })
    expect(missingCarbsOrFat([oats, unset])).toBe(true)
    expect(missingCarbsOrFat([oats, oats])).toBe(false)
  })

  // Not set whenever nothing is known, an empty list included, so meal totals add up to the
  // day's total. Screens show an empty day as 0 g.
  it('gives not set when no item has a value, or there are no items', () => {
    expect(sumNutrients([unset, unset])).toMatchObject({ carbsG: null, fatG: null })
    expect(sumNutrients([])).toEqual({ kcal: 0, proteinG: 0, carbsG: null, fatG: null })
    expect(missingCarbsOrFat([])).toBe(false)
  })

  it('totals a recipe’s carbs and fat from its ingredients', () => {
    const rice = { kcal: 270, proteinG: 5.3, carbsG: 59.6, fatG: 0.4 }
    const ingredients = [
      { perServing: oats, servings: 2 },
      { perServing: rice, servings: 1 },
    ]
    expect(recipeTotals(ingredients)).toEqual({
      kcal: 570,
      proteinG: 15.3,
      carbsG: 113.6,
      fatG: 5.4,
    })
    expect(recipePerServing(ingredients, 4)).toEqual({
      kcal: 142.5,
      proteinG: 3.825,
      carbsG: 28.4,
      fatG: 1.35,
    })
  })

  // A recipe is one entry, so partial carbs would look complete on the log (review of PR 2).
  it('gives a recipe carbs or fat not set when any ingredient has them not set', () => {
    const ingredients = [
      { perServing: oats, servings: 2 },
      { perServing: unset, servings: 1 },
    ]
    expect(recipeTotals(ingredients)).toEqual({ kcal: 400, proteinG: 20, carbsG: null, fatG: null })
    expect(recipePerServing(ingredients, 2)).toMatchObject({ carbsG: null, fatG: null })
    expect(recipeEntryNutrients(ingredients, 2, 1)).toMatchObject({ carbsG: null, fatG: null })
  })

  it('gives a recipe with no ingredients 0 g, like its kcal', () => {
    expect(recipeTotals([])).toEqual({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 })
  })

  it('splits carbs and fat by meal', () => {
    const totals = totalsByMeal([
      { meal: 'breakfast', ...oats },
      { meal: 'dinner', ...unset },
    ])
    expect(totals.breakfast).toEqual(oats)
    expect(totals.dinner).toEqual(unset)
    expect(totals.lunch).toEqual({ kcal: 0, proteinG: 0, carbsG: null, fatG: null })
  })

  it('keeps one decimal and never drops below the smaller serving’s grams', () => {
    fc.assert(
      fc.property(perServing, servings, servings, (food, a, b) => {
        const small = scaleNutrients(food, Math.min(a, b))
        const large = scaleNutrients(food, Math.max(a, b))
        for (const key of ['carbsG', 'fatG'] as const) {
          const lo = small[key]
          const hi = large[key]
          expect(lo === null).toBe(food[key] === null)
          if (lo === null || hi === null) continue
          expect(decimalsOf(lo)).toBeLessThanOrEqual(1)
          expect(hi).toBeGreaterThanOrEqual(lo)
        }
      }),
    )
  })

  it('sums known grams to the rounded total of the parts', () => {
    fc.assert(
      fc.property(fc.array(perServing, { maxLength: 30 }), (items) => {
        const known = items.flatMap((item) => (item.carbsG === null ? [] : [item.carbsG]))
        const total = sumNutrients(items).carbsG
        if (known.length === 0) {
          expect(total).toBeNull()
        } else {
          expect(total).toBe(roundGrams(known.reduce((sum, value) => sum + value, 0)))
        }
        expect(missingCarbsOrFat(items)).toBe(
          items.some((item) => item.carbsG === null || item.fatG === null),
        )
      }),
    )
  })
})

// The day the picker logs into; ranking is relative to it.
const today = '2026-11-21'

describe('useScores', () => {
  const oats = { kind: 'food', id: 'oats' } as const

  it('counts a log on the day as 1, halving every 30 days', () => {
    const scores = useScores(
      [
        entry({ source: oats, date: today }),
        entry({ source: oats, date: '2026-10-22' }), // 30 days before: 0.5
      ],
      today,
    )
    expect(scores.get('food:oats')).toBeCloseTo(1.5, 10)
  })

  it('ignores entries after the day', () => {
    expect(useScores([entry({ source: oats, date: '2026-11-22' })], today).size).toBe(0)
  })

  it('never lowers a score for another log, and a newer log counts more than an older one', () => {
    const day = fc.integer({ min: 0, max: 400 }).map((ago) => addDays(today, -ago))
    fc.assert(
      fc.property(fc.array(day, { maxLength: 30 }), day, day, (dates, a, b) => {
        const logs = dates.map((date) => entry({ source: oats, date }))
        const before = useScores(logs, today).get('food:oats') ?? 0
        const plusA = useScores([...logs, entry({ source: oats, date: a })], today).get('food:oats')
        const plusB = useScores([...logs, entry({ source: oats, date: b })], today).get('food:oats')
        expect(plusA).toBeGreaterThan(before)
        if (a > b) expect(plusA).toBeGreaterThan(plusB ?? 0)
      }),
    )
  })
})

describe('recentPicks', () => {
  const food = (id: string) => ({ kind: 'food', id }) as const

  it('lists each food or recipe once, newest logged first, with its latest servings', () => {
    const picks = recentPicks(
      [
        entry({ source: food('rice'), name: 'Rice', date: '2026-11-19', servings: 1 }),
        entry({ source: food('oats'), name: 'Oats', date: '2026-11-20', servings: 2 }),
        entry({ source: food('rice'), name: 'Rice', date: '2026-11-20', servings: 1.5 }),
        entry({ source: food('dal'), name: 'Dal', date: '2026-11-18' }),
      ],
      10,
    )
    expect(picks.map((pick) => [pick.name, pick.servings, pick.count])).toEqual([
      ['Rice', 1.5, 2],
      ['Oats', 2, 1],
      ['Dal', 1, 1],
    ])
  })

  it('returns at most the limit, each source once, in reverse order of last use', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('a', 'b', 'c', 'd', 'e'), { maxLength: 40 }),
        fc.integer({ min: 0, max: 6 }),
        (ids, limit) => {
          const picks = recentPicks(
            ids.map((id) => entry({ source: food(id), name: id })),
            limit,
          )
          const listed = picks.map((pick) => pick.source.id)
          expect(listed.length).toBe(Math.min(limit, new Set(ids).size))
          expect(new Set(listed).size).toBe(listed.length)
          const lastUse = (id: string) => (ids as string[]).lastIndexOf(id)
          for (let i = 1; i < listed.length; i++) {
            expect(lastUse(listed[i - 1] ?? '')).toBeGreaterThan(lastUse(listed[i] ?? ''))
          }
        },
      ),
    )
  })
})

describe('mostUsed', () => {
  // Phase 9 criterion: last month's habit outranks last year's.
  it('ranks a food logged daily this month above one logged often a year ago', () => {
    const recent = { kind: 'food', id: 'paneer' } as const
    const old = { kind: 'food', id: 'bread' } as const
    const logs = [
      ...Array.from({ length: 60 }, (_, i) =>
        entry({ source: old, name: 'Bread', date: addDays(today, -(330 + (i % 30))) }),
      ),
      ...Array.from({ length: 30 }, (_, i) =>
        entry({ source: recent, name: 'Paneer', date: addDays(today, -i) }),
      ),
    ]
    expect(mostUsed(logs, today, 10).map((pick) => pick.name)).toEqual(['Paneer', 'Bread'])
  })

  it('returns the exported QuickPick type that the picker uses', () => {
    expectTypeOf(mostUsed([], today, 1)).toEqualTypeOf<QuickPick[]>()
  })

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
      today,
      10,
    )
    expect(ranked.map((pick) => pick.source.id)).toEqual(['oats', 'yogurt', 'apple', 'chili'])
    expect(ranked[0]).toEqual({ source: oats, name: 'Oats', servings: 1, count: 2 })
  })

  it('offers the servings from the latest time each was logged', () => {
    const ranked = mostUsed(
      [entry({ date: '2026-11-18', servings: 2 }), entry({ date: '2026-11-19', servings: 1.5 })],
      today,
      10,
    )
    expect(ranked[0]?.servings).toBe(1.5)
  })

  it('on one day, offers the later entry’s servings', () => {
    const ranked = mostUsed(
      [entry({ meal: 'breakfast', servings: 1 }), entry({ meal: 'dinner', servings: 2 })],
      today,
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
          const listed = logged.map(({ id, date }) =>
            entry({ source: { kind: 'food', id }, name: id, date }),
          )
          const ranked = mostUsed(listed, today, limit)
          const scores = useScores(listed, today)
          const ids = ranked.map((pick) => pick.source.id)
          expect(ids.length).toBeLessThanOrEqual(limit)
          expect(new Set(ids).size).toBe(ids.length)
          const scoreOf = (pick: QuickPick | undefined) =>
            pick ? (scores.get(sourceKey(pick.source)) ?? 0) : 0
          for (let i = 1; i < ranked.length; i++) {
            expect(scoreOf(ranked[i - 1])).toBeGreaterThanOrEqual(scoreOf(ranked[i]))
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
