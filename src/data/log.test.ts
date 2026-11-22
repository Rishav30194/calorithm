import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { dayId } from './dayId'
import type { LocalDb } from './db'
import { createFood, createRecipe, setFoodArchived, updateFood } from './foods'
import {
  changeServings,
  copyMealTo,
  dayComplete,
  entriesBetween,
  entriesOn,
  logFood,
  logRecipe,
  logSource,
  quickPicks,
  removeEntry,
  setDayComplete,
} from './log'
import { closeAll, manualClock, openDb, userId } from './sync/testing/fixtures'
import { daysSpec, logEntriesSpec } from './tables'

let db: LocalDb
let time: ReturnType<typeof manualClock>

beforeEach(() => {
  db = openDb('calorithm-test-log')
  time = manualClock()
})

afterEach(closeAll)

const addOats = () =>
  createFood(db, time.clock, userId, {
    name: 'Oats',
    servingSize: 40,
    servingUnit: 'g',
    kcal: 150,
    proteinG: 5,
    carbsG: 20,
    fatG: 3,
  })

describe('logFood', () => {
  it('copies the food’s values for the servings logged', async () => {
    const food = await addOats()

    const entry = await logFood(db, time.clock, userId, {
      date: '2026-11-20',
      meal: 'breakfast',
      food,
      servings: 1.3,
    })

    expect(entry).toMatchObject({
      date: '2026-11-20',
      meal: 'breakfast',
      food_id: food.id,
      recipe_id: null,
      servings: 1.3,
      name: 'Oats',
      kcal: 195,
      protein_g: 6.5,
    })
    expect(logEntriesSpec.parse(await db.rows('log_entries').get(entry.id))).toEqual(entry)
  })

  it('rounds servings to two decimals before scaling', async () => {
    const food = await addOats()

    const entry = await logFood(db, time.clock, userId, {
      date: '2026-11-20',
      meal: 'snacks',
      food,
      servings: 0.3333,
    })

    expect(entry).toMatchObject({ servings: 0.33, kcal: 50, protein_g: 1.7 })
  })
})

describe('logRecipe', () => {
  it('logs a fraction of the recipe from its current ingredients', async () => {
    const food = await addOats()
    const recipe = await createRecipe(db, time.clock, userId, {
      name: 'Porridge',
      servings: 4,
      items: [{ foodId: food.id, servings: 2 }],
    })

    const entry = await logRecipe(db, time.clock, userId, {
      date: '2026-11-20',
      meal: 'breakfast',
      recipe,
      servings: 0.5,
    })

    // 300 kcal and 10 g protein make 4 servings; half a serving is an eighth.
    expect(entry).toMatchObject({
      recipe_id: recipe.id,
      food_id: null,
      name: 'Porridge',
      kcal: 38,
      protein_g: 1.3,
    })
  })
})

describe('entriesOn', () => {
  it('lists the day’s entries as the calculations see them, without removed ones', async () => {
    const food = await addOats()
    const kept = await logFood(db, time.clock, userId, {
      date: '2026-11-20',
      meal: 'lunch',
      food,
      servings: 1,
    })
    const removed = await logFood(db, time.clock, userId, {
      date: '2026-11-20',
      meal: 'lunch',
      food,
      servings: 2,
    })
    await logFood(db, time.clock, userId, {
      date: '2026-11-21',
      meal: 'lunch',
      food,
      servings: 1,
    })

    await removeEntry(db, time.clock, removed.id)

    expect(await entriesOn(db, '2026-11-20')).toEqual([
      {
        id: kept.id,
        date: '2026-11-20',
        meal: 'lunch',
        source: { kind: 'food', id: food.id },
        name: 'Oats',
        servings: 1,
        kcal: 150,
        proteinG: 5,
        carbsG: 20,
        fatG: 3,
      },
    ])
  })
})

describe('changeServings', () => {
  it('rescales the entry from its own values, not the food’s current ones', async () => {
    const food = await addOats()
    const entry = await logFood(db, time.clock, userId, {
      date: '2026-11-20',
      meal: 'breakfast',
      food,
      servings: 2,
    })
    await updateFood(db, time.clock, food.id, {
      name: 'Oats',
      servingSize: 40,
      servingUnit: 'g',
      kcal: 999,
      proteinG: 99,
      carbsG: 20,
      fatG: 3,
    })

    await changeServings(db, time.clock, entry.id, 3)

    const [changed] = await entriesOn(db, '2026-11-20')
    expect(changed).toMatchObject({ servings: 3, kcal: 450, proteinG: 15 })
  })
})

describe('changeServings precision', () => {
  it('rescales from the exact per-serving values, not the rounded totals', async () => {
    const tiny = await createFood(db, time.clock, userId, {
      name: 'Mint',
      servingSize: 1,
      servingUnit: 'leaf',
      kcal: 7,
      proteinG: 0.4,
      carbsG: 20,
      fatG: 3,
    })
    const entry = await logFood(db, time.clock, userId, {
      date: '2026-11-20',
      meal: 'snacks',
      food: tiny,
      servings: 0.1,
    })
    expect(entry).toMatchObject({ kcal: 1, protein_g: 0 })

    await changeServings(db, time.clock, entry.id, 10)

    expect((await entriesOn(db, '2026-11-20'))[0]).toMatchObject({ kcal: 70, proteinG: 4 })
  })

  it('keeps the entry’s place in its meal', async () => {
    const food = await addOats()
    const first = await logFood(db, time.clock, userId, {
      date: '2026-11-20',
      meal: 'lunch',
      food,
      servings: 1,
    })
    time.advance(1_000)
    await logFood(db, time.clock, userId, { date: '2026-11-20', meal: 'lunch', food, servings: 2 })
    time.advance(1_000)

    await changeServings(db, time.clock, first.id, 3)

    expect((await entriesOn(db, '2026-11-20')).map((e) => e.servings)).toEqual([3, 2])
  })
})

describe('copying and changing what isn’t there', () => {
  it('skips rows the app can’t show, so the preview count matches what’s copied', async () => {
    const food = await addOats()
    await logFood(db, time.clock, userId, { date: '2026-11-19', meal: 'lunch', food, servings: 1 })
    const bad = await logFood(db, time.clock, userId, {
      date: '2026-11-19',
      meal: 'lunch',
      food,
      servings: 1,
    })
    await db.table('log_entries').update(bad.id, { food_id: null })

    const copies = await copyMealTo(db, time.clock, userId, {
      from: { date: '2026-11-19', meal: 'lunch' },
      to: { date: '2026-11-20', meal: 'lunch' },
    })

    expect(copies).toHaveLength(1)
  })

  it('reports changing the servings of an entry that isn’t stored', async () => {
    expect(await changeServings(db, time.clock, 'b0000000-0000-4000-8000-0000000000ff', 2)).toEqual(
      {
        ok: false,
        reason: 'not_found',
      },
    )
  })
})

describe('copyMealTo', () => {
  it('keeps the meal’s order in the copies', async () => {
    const food = await addOats()
    for (const servings of [1, 2, 3, 4]) {
      await logFood(db, time.clock, userId, {
        date: '2026-11-19',
        meal: 'breakfast',
        food,
        servings,
      })
      time.advance(1_000)
    }

    await copyMealTo(db, time.clock, userId, {
      from: { date: '2026-11-19', meal: 'breakfast' },
      to: { date: '2026-11-20', meal: 'breakfast' },
    })

    expect((await entriesOn(db, '2026-11-20')).map((e) => e.servings)).toEqual([1, 2, 3, 4])
  })

  it('adds copies with new ids and the values they had', async () => {
    const food = await addOats()
    const original = await logFood(db, time.clock, userId, {
      date: '2026-11-19',
      meal: 'breakfast',
      food,
      servings: 2,
    })
    await logFood(db, time.clock, userId, {
      date: '2026-11-19',
      meal: 'dinner',
      food,
      servings: 1,
    })

    const copies = await copyMealTo(db, time.clock, userId, {
      from: { date: '2026-11-19', meal: 'breakfast' },
      to: { date: '2026-11-20', meal: 'breakfast' },
    })

    expect(copies).toHaveLength(1)
    expect(copies[0]?.id).not.toBe(original.id)
    expect(await entriesOn(db, '2026-11-20')).toEqual([
      expect.objectContaining({ meal: 'breakfast', servings: 2, kcal: 300, proteinG: 10 }),
    ])
  })
})

describe('days', () => {
  it('marks a day complete in the row with the derived id', async () => {
    await setDayComplete(db, time.clock, userId, '2026-11-20', true)

    const id = await dayId(userId, '2026-11-20')
    expect(daysSpec.parse(await db.rows('days').get(id))).toMatchObject({
      date: '2026-11-20',
      complete: true,
    })
    expect(await dayComplete(db, userId, '2026-11-20')).toBe(true)
  })

  it('keeps one row per day when toggled', async () => {
    await setDayComplete(db, time.clock, userId, '2026-11-20', true)
    await setDayComplete(db, time.clock, userId, '2026-11-20', false)

    expect(await db.rows('days').count()).toBe(1)
    expect(await dayComplete(db, userId, '2026-11-20')).toBe(false)
  })

  it('brings back a day another device deleted', async () => {
    const id = await dayId(userId, '2026-11-20')
    await db.table('days').put({
      id,
      user_id: userId,
      date: '2026-11-20',
      complete: false,
      updated_at: '2026-11-19T10:00:00.000001+00:00',
      client_updated_at: '2026-11-19T10:00:00.000Z',
      deleted_at: '2026-11-19T10:00:00.000Z',
      schema_version: 1,
    })

    await setDayComplete(db, time.clock, userId, '2026-11-20', true)

    expect(await dayComplete(db, userId, '2026-11-20')).toBe(true)
  })

  it('treats a day never marked as incomplete', async () => {
    expect(await dayComplete(db, userId, '2026-11-19')).toBe(false)
  })
})

describe('logSource', () => {
  it('logs a food or recipe by id with its current values', async () => {
    const food = await addOats()
    const recipe = await createRecipe(db, time.clock, userId, {
      name: 'Porridge',
      servings: 2,
      items: [{ foodId: food.id, servings: 2 }],
    })

    const fromFood = await logSource(db, time.clock, userId, {
      date: '2026-11-20',
      meal: 'breakfast',
      source: { kind: 'food', id: food.id },
      servings: 2,
    })
    const fromRecipe = await logSource(db, time.clock, userId, {
      date: '2026-11-20',
      meal: 'dinner',
      source: { kind: 'recipe', id: recipe.id },
      servings: 1,
    })

    expect(fromFood).toMatchObject({ ok: true, row: { name: 'Oats', kcal: 300 } })
    expect(fromRecipe).toMatchObject({ ok: true, row: { name: 'Porridge', kcal: 150 } })
  })

  it('reports a source that isn’t stored', async () => {
    expect(
      await logSource(db, time.clock, userId, {
        date: '2026-11-20',
        meal: 'lunch',
        source: { kind: 'food', id: 'f0000000-0000-4000-8000-0000000000ff' },
        servings: 1,
      }),
    ).toEqual({ ok: false, reason: 'not_found' })
  })
})

describe('entriesBetween', () => {
  it('lists the entries from the first day to the last, inclusive', async () => {
    const food = await addOats()
    for (const date of ['2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20']) {
      await logFood(db, time.clock, userId, { date, meal: 'lunch', food, servings: 1 })
    }

    const entries = await entriesBetween(db, '2026-11-18', '2026-11-19')

    expect(entries.map((entry) => entry.date)).toEqual(['2026-11-18', '2026-11-19'])
  })
})

describe('quickPicks', () => {
  it('offers today’s, yesterday’s, and the most used, without archived foods', async () => {
    const oats = await addOats()
    const rice = await createFood(db, time.clock, userId, {
      name: 'Rice',
      servingSize: 75,
      servingUnit: 'g',
      kcal: 270,
      proteinG: 5.3,
      carbsG: 20,
      fatG: 3,
    })
    const old = await createFood(db, time.clock, userId, {
      name: 'Old bread',
      servingSize: 1,
      servingUnit: 'slice',
      kcal: 80,
      proteinG: 3,
      carbsG: 20,
      fatG: 3,
    })
    await logFood(db, time.clock, userId, {
      date: '2026-11-21',
      meal: 'breakfast',
      food: oats,
      servings: 2,
    })
    await logFood(db, time.clock, userId, {
      date: '2026-11-20',
      meal: 'dinner',
      food: rice,
      servings: 1.5,
    })
    await logFood(db, time.clock, userId, {
      date: '2026-11-19',
      meal: 'dinner',
      food: rice,
      servings: 1,
    })
    await logFood(db, time.clock, userId, {
      date: '2026-11-19',
      meal: 'lunch',
      food: old,
      servings: 1,
    })
    // Older than the 60-day window: doesn't count toward most used.
    await logFood(db, time.clock, userId, {
      date: '2026-09-01',
      meal: 'lunch',
      food: oats,
      servings: 1,
    })
    await logFood(db, time.clock, userId, {
      date: '2026-09-02',
      meal: 'lunch',
      food: oats,
      servings: 1,
    })
    await setFoodArchived(db, time.clock, old.id, true)

    const picks = await quickPicks(db, '2026-11-21')

    expect(picks.today.map((pick) => [pick.name, pick.servings])).toEqual([['Oats', 2]])
    expect(picks.yesterday.map((pick) => [pick.name, pick.servings])).toEqual([['Rice', 1.5]])
    expect(picks.mostUsed.map((pick) => [pick.name, pick.count])).toEqual([
      ['Rice', 2],
      ['Oats', 1],
    ])
  })

  it('shows a food’s current name, not the name it was logged under', async () => {
    const oats = await addOats()
    await logFood(db, time.clock, userId, {
      date: '2026-11-21',
      meal: 'breakfast',
      food: oats,
      servings: 1,
    })
    await updateFood(db, time.clock, oats.id, {
      name: 'Rolled oats',
      servingSize: 40,
      servingUnit: 'g',
      kcal: 150,
      proteinG: 5,
      carbsG: 20,
      fatG: 3,
    })

    expect((await quickPicks(db, '2026-11-21')).today[0]?.name).toBe('Rolled oats')
  })
})

describe('carbs and fat (decision 0025)', () => {
  const at = { date: '2026-11-20', meal: 'breakfast' } as const

  it('copies them when logging, and rescales them with the servings', async () => {
    const food = await addOats()
    const entry = await logFood(db, time.clock, userId, { ...at, food, servings: 1.5 })
    expect(entry).toMatchObject({
      carbs_g: 30,
      fat_g: 4.5,
      carbs_g_per_serving: 20,
      fat_g_per_serving: 3,
    })

    await changeServings(db, time.clock, entry.id, 0.5)

    expect(logEntriesSpec.parse(await db.rows('log_entries').get(entry.id))).toMatchObject({
      carbs_g: 10,
      fat_g: 1.5,
    })
  })

  it('keeps them through Copy from…', async () => {
    const food = await addOats()
    await logFood(db, time.clock, userId, { ...at, food, servings: 2 })

    const [copy] = await copyMealTo(db, time.clock, userId, {
      from: at,
      to: { date: '2026-11-21', meal: 'lunch' },
    })

    expect(copy).toMatchObject({ carbs_g: 40, fat_g: 6, carbs_g_per_serving: 20 })
  })

  it('leaves them not set for a food saved before they existed', async () => {
    const food = await addOats()
    const old = { ...food, carbs_g: null, fat_g: null }
    const entry = await logFood(db, time.clock, userId, { ...at, food: old, servings: 2 })

    expect(entry).toMatchObject({ carbs_g: null, fat_g: null, carbs_g_per_serving: null })
    expect((await entriesOn(db, at.date))[0]).toMatchObject({ carbsG: null, fatG: null })
  })

  it('totals a recipe’s carbs and fat when it is logged', async () => {
    const food = await addOats()
    const recipe = await createRecipe(db, time.clock, userId, {
      name: 'Porridge',
      servings: 2,
      items: [{ foodId: food.id, servings: 3 }],
    })

    const entry = await logRecipe(db, time.clock, userId, { ...at, recipe, servings: 1 })

    expect(entry).toMatchObject({ carbs_g: 30, fat_g: 4.5 })
  })
})
