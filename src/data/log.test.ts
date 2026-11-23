import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { dayId } from './dayId'
import type { LocalDb } from './db'
import { createFood, createRecipe, listFoods, setFoodArchived, updateFood } from './foods'
import {
  changeServings,
  copyMealTo,
  dayComplete,
  entriesBetween,
  entriesOn,
  logCatalogFood,
  logFood,
  logNewFood,
  logPlate,
  logRecipe,
  logScannedFood,
  logSource,
  quickPicks,
  removeEntry,
  setDayComplete,
} from './log'
import { closeAll, manualClock, openDb, userId } from './sync/testing/fixtures'
import { daysSpec, type LogEntryRow, logEntriesSpec } from './tables'

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
        portion: { amount: 40, unit: 'g' },
        perServing: { kcal: 150, proteinG: 5, carbsG: 20, fatG: 3 },
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

// A total past the database's range would save here and fail on sync, so it's refused up front.
describe('entries past the database’s limits', () => {
  const addRice = () =>
    createFood(db, time.clock, userId, {
      name: 'Rice',
      servingSize: 100,
      servingUnit: 'g',
      kcal: 130,
      proteinG: 2.7,
      carbsG: 80,
      fatG: 0.3,
    })

  it('refuses to log one, and stores nothing', async () => {
    const food = await addRice()

    await expect(
      logFood(db, time.clock, userId, { date: '2026-11-20', meal: 'lunch', food, servings: 200 }),
    ).rejects.toThrow(/past the database’s limits/)

    expect(await entriesOn(db, '2026-11-20')).toEqual([])
  })

  it('reports a pick by id that is past them, and stores nothing', async () => {
    const food = await addRice()

    expect(
      await logSource(db, time.clock, userId, {
        date: '2026-11-20',
        meal: 'lunch',
        source: { kind: 'food', id: food.id },
        servings: 200,
      }),
    ).toEqual({ ok: false, reason: 'too_large' })
    expect(await entriesOn(db, '2026-11-20')).toEqual([])
  })

  // An entry stored before the check can never sync, so a copy of it would fail the same way.
  it('copies a meal without an entry stored past them before the check', async () => {
    const food = await addRice()
    await logFood(db, time.clock, userId, { date: '2026-11-20', meal: 'lunch', food, servings: 1 })
    const stored = await logFood(db, time.clock, userId, {
      date: '2026-11-20',
      meal: 'lunch',
      food,
      servings: 2,
    })
    const pastLimits: LogEntryRow = { ...stored, servings: 200, carbs_g: 16_000 }
    await db.rows('log_entries').put(pastLimits)

    const copies = await copyMealTo(db, time.clock, userId, {
      from: { date: '2026-11-20', meal: 'lunch' },
      to: { date: '2026-11-21', meal: 'lunch' },
    })

    expect(copies).toHaveLength(1)
    expect(await entriesOn(db, '2026-11-21')).toMatchObject([{ servings: 1, carbsG: 80 }])
  })

  it('refuses to change the servings to one, and keeps the entry as it was', async () => {
    const food = await addRice()
    const entry = await logFood(db, time.clock, userId, {
      date: '2026-11-20',
      meal: 'lunch',
      food,
      servings: 2,
    })

    expect(await changeServings(db, time.clock, entry.id, 200)).toEqual({
      ok: false,
      reason: 'too_large',
    })

    const [kept] = await entriesOn(db, '2026-11-20')
    expect(kept).toMatchObject({ servings: 2, carbsG: 160 })
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
  it('offers the recent and the most used, without archived foods', async () => {
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
    // About 80 days old: counts toward most used, but much less than this week's logs.
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

    expect(picks.recent.map((pick) => [pick.name, pick.servings])).toEqual([
      ['Oats', 2],
      ['Rice', 1.5],
    ])
    // Oats was logged three times, but two of them long ago; Rice twice this week.
    expect(picks.mostUsed.map((pick) => [pick.name, pick.count])).toEqual([
      ['Rice', 2],
      ['Oats', 3],
    ])
    expect(picks.scores.get(`food:${rice.id}`)).toBeGreaterThan(
      picks.scores.get(`food:${oats.id}`) ?? 0,
    )
    expect(picks.scores.has(`food:${old.id}`)).toBe(false)
    // Phase 15: each meal's usual foods, from the last 60 days, without archived ones.
    expect(picks.byMeal.dinner.map((pick) => [pick.name, pick.count])).toEqual([['Rice', 2]])
    expect(picks.byMeal.breakfast.map((pick) => pick.name)).toEqual(['Oats'])
    expect(picks.byMeal.lunch).toEqual([])
    expect(picks.byMeal.snacks).toEqual([])
  })

  it('breaks ties in a meal’s list by the food’s current name', async () => {
    const zucchini = await createFood(db, time.clock, userId, {
      name: 'Zucchini',
      servingSize: 40,
      servingUnit: 'g',
      kcal: 150,
      proteinG: 5,
      carbsG: 20,
      fatG: 3,
    })
    const rice = await createFood(db, time.clock, userId, {
      name: 'Rice',
      servingSize: 75,
      servingUnit: 'g',
      kcal: 270,
      proteinG: 5.3,
      carbsG: 20,
      fatG: 3,
    })
    for (const food of [zucchini, rice]) {
      await logFood(db, time.clock, userId, {
        date: '2026-11-20',
        meal: 'dinner',
        food,
        servings: 1,
      })
    }
    // Logged as "Zucchini", now named "Courgette": it sorts as Courgette, before Rice.
    await updateFood(db, time.clock, zucchini.id, {
      name: 'Courgette',
      servingSize: 40,
      servingUnit: 'g',
      kcal: 150,
      proteinG: 5,
      carbsG: 20,
      fatG: 3,
    })

    const picks = await quickPicks(db, '2026-11-21')
    expect(picks.byMeal.dinner.map((pick) => pick.name)).toEqual(['Courgette', 'Rice'])
  })

  it('leaves out entries more than 180 days before the day', async () => {
    const oats = await addOats()
    await logFood(db, time.clock, userId, {
      date: '2026-05-24',
      meal: 'lunch',
      food: oats,
      servings: 1,
    })

    const picks = await quickPicks(db, '2026-11-21')

    expect(picks.recent).toEqual([])
    expect(picks.mostUsed).toEqual([])
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

    expect((await quickPicks(db, '2026-11-21')).recent[0]?.name).toBe('Rolled oats')
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

  it('keeps logged entries as they were when the food’s carbs or fat change', async () => {
    const food = await addOats()
    const entry = await logFood(db, time.clock, userId, { ...at, food, servings: 1 })

    await updateFood(db, time.clock, food.id, {
      name: 'Oats',
      servingSize: 40,
      servingUnit: 'g',
      kcal: 150,
      proteinG: 5,
      carbsG: 25,
      fatG: 4,
    })

    expect(logEntriesSpec.parse(await db.rows('log_entries').get(entry.id))).toMatchObject({
      carbs_g: 20,
      fat_g: 3,
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

  it('logs a recipe as not set when one ingredient has carbs or fat not set', async () => {
    const oats = await addOats()
    const old = await createFood(db, time.clock, userId, {
      name: 'Old toast',
      servingSize: 1,
      servingUnit: 'slice',
      kcal: 80,
      proteinG: 3,
      carbsG: 15,
      fatG: 1,
    })
    // As a food saved before carbs and fat existed is stored.
    await db.table('foods').update(old.id, { carbs_g: null, fat_g: null })
    const recipe = await createRecipe(db, time.clock, userId, {
      name: 'Breakfast plate',
      servings: 1,
      items: [
        { foodId: oats.id, servings: 1 },
        { foodId: old.id, servings: 2 },
      ],
    })

    const entry = await logRecipe(db, time.clock, userId, { ...at, recipe, servings: 1 })

    expect(entry).toMatchObject({ kcal: 310, carbs_g: null, fat_g: null })
  })
})

describe('logCatalogFood (decision 0027)', () => {
  const turmeric = {
    id: 'turmeric',
    name: 'Turmeric',
    aliases: ['haldi'],
    category: 'spices',
    servingSize: 1,
    servingUnit: 'tsp (3 g)',
    kcal: 9,
    proteinG: 0.3,
    carbsG: 2,
    fatG: 0.1,
    source: { dataset: 'SR Legacy', fdcId: 172231 },
  }
  const at = { date: '2026-11-22', meal: 'lunch' } as const

  it('copies the item into your foods with its id, then logs one serving of it', async () => {
    const entry = await logCatalogFood(db, time.clock, userId, at, turmeric)

    const foods = await listFoods(db)
    expect(foods).toEqual([
      expect.objectContaining({
        name: 'Turmeric',
        servingUnit: 'tsp (3 g)',
        kcal: 9,
        carbsG: 2,
        catalogId: 'turmeric',
      }),
    ])
    expect(entry).toMatchObject({ food_id: foods[0]?.id, servings: 1, kcal: 9, carbs_g: 2 })
  })

  it('logs the copy you already have instead of copying the item again', async () => {
    const first = await logCatalogFood(db, time.clock, userId, at, turmeric)
    const second = await logCatalogFood(db, time.clock, userId, at, turmeric)

    expect(await listFoods(db)).toHaveLength(1)
    expect(second.food_id).toBe(first.food_id)
  })

  // The picker offers the item again once its copy is archived; picking it brings the copy
  // back rather than logging a food you can no longer see.
  it('restores an archived copy when the item is picked again', async () => {
    const first = await logCatalogFood(db, time.clock, userId, at, turmeric)
    if (!first.food_id) throw new Error('no food logged')
    await setFoodArchived(db, time.clock, first.food_id, true)

    const second = await logCatalogFood(db, time.clock, userId, at, turmeric)

    expect(second.food_id).toBe(first.food_id)
    expect(await listFoods(db)).toEqual([expect.objectContaining({ archived: false })])
  })
})

describe('logging from a barcode scan', () => {
  const at = { date: '2026-11-22', meal: 'snacks' } as const
  const paneer = {
    name: 'Paneer',
    servingSize: 100,
    servingUnit: 'g',
    kcal: 265,
    proteinG: 18.3,
    carbsG: 1.2,
    fatG: 20.8,
    barcode: '8901234567890',
  }

  it('saves a new food with its barcode and logs one serving, in one write', async () => {
    const entry = await logNewFood(db, time.clock, userId, at, paneer)

    const [food] = await listFoods(db)
    expect(food).toMatchObject({ name: 'Paneer', barcode: '8901234567890' })
    expect(entry).toMatchObject({ ...at, food_id: food?.id, servings: 1, kcal: 265 })
    expect((await db.outbox.toArray()).map((item) => item.table).sort()).toEqual([
      'foods',
      'log_entries',
    ])
  })

  it('logs one serving of a saved food, restoring it when it was archived', async () => {
    const food = await createFood(db, time.clock, userId, paneer)
    await setFoodArchived(db, time.clock, food.id, true)

    const result = await logScannedFood(db, time.clock, userId, at, food.id)

    expect(result).toMatchObject({ ok: true, row: { food_id: food.id, servings: 1 } })
    expect((await listFoods(db))[0]).toMatchObject({ id: food.id, archived: false })
  })

  it('reports a food removed since the scan found it', async () => {
    const food = await createFood(db, time.clock, userId, paneer)
    await db.rows('foods').update(food.id, { deleted_at: '2026-11-22T10:00:00.000Z' })

    expect(await logScannedFood(db, time.clock, userId, at, food.id)).toEqual({
      ok: false,
      reason: 'not_found',
    })
    expect(await entriesOn(db, at.date)).toEqual([])
  })
})

describe('the serving an entry was logged with (phase 14)', () => {
  const at = { date: '2026-11-22', meal: 'lunch' } as const
  const chicken = {
    name: 'Chicken breast',
    servingSize: 100,
    servingUnit: 'g',
    kcal: 165,
    proteinG: 31,
    carbsG: 0,
    fatG: 3.6,
  }

  it('copies the food’s serving, so the entry knows its weight', async () => {
    const food = await createFood(db, time.clock, userId, chicken)
    const row = await logFood(db, time.clock, userId, { ...at, food, servings: 0.7 })

    expect(row).toMatchObject({ serving_size: 100, serving_unit: 'g', servings: 0.7, kcal: 116 })
    const [entry] = await entriesOn(db, at.date)
    expect(entry).toMatchObject({
      portion: { amount: 100, unit: 'g' },
      perServing: { kcal: 165, proteinG: 31, carbsG: 0, fatG: 3.6 },
    })
  })

  it('keeps the logged serving after the food changes', async () => {
    const food = await createFood(db, time.clock, userId, chicken)
    await logFood(db, time.clock, userId, { ...at, food, servings: 1 })
    await updateFood(db, time.clock, food.id, { ...chicken, servingSize: 150 })

    const [entry] = await entriesOn(db, at.date)
    expect(entry?.portion).toEqual({ amount: 100, unit: 'g' })
  })

  it('has no weight for a recipe, a piece, or an entry logged before this', async () => {
    const roti = await createFood(db, time.clock, userId, {
      ...chicken,
      name: 'Roti',
      servingSize: 1,
      servingUnit: 'roti',
    })
    await logFood(db, time.clock, userId, { ...at, food: roti, servings: 2 })
    const recipe = await createRecipe(db, time.clock, userId, {
      name: 'Curry',
      servings: 4,
      items: [{ foodId: roti.id, servings: 1 }],
    })
    await logSource(db, time.clock, userId, {
      ...at,
      source: { kind: 'recipe', id: recipe.id },
      servings: 1,
    })
    const old = await logFood(db, time.clock, userId, { ...at, food: roti, servings: 1 })
    const unserved: LogEntryRow = { ...old, serving_size: null, serving_unit: null }
    await db.rows('log_entries').put(unserved)

    const rows = (await db.rows('log_entries').toArray()).map((raw) => logEntriesSpec.parse(raw))
    expect(rows.map((row) => row?.serving_size ?? null).sort()).toEqual([1, null, null])
    expect((await entriesOn(db, at.date)).map((entry) => entry.portion)).toEqual([null, null, null])
  })

  it('carries the serving over when a meal is copied', async () => {
    const food = await createFood(db, time.clock, userId, chicken)
    await logFood(db, time.clock, userId, { ...at, food, servings: 1.5 })

    const [copy] = await copyMealTo(db, time.clock, userId, {
      from: at,
      to: { date: '2026-11-23', meal: 'dinner' },
    })
    expect(copy).toMatchObject({ serving_size: 100, serving_unit: 'g', servings: 1.5 })
  })
})

describe('logCatalogFood servings (phase 14)', () => {
  it('logs the servings chosen in the amount step', async () => {
    const onion = {
      id: 'onion',
      name: 'Onion',
      aliases: ['pyaz'],
      category: 'vegetables',
      servingSize: 100,
      servingUnit: 'g',
      kcal: 40,
      proteinG: 1.1,
      carbsG: 9.3,
      fatG: 0.1,
      source: { dataset: 'SR Legacy', fdcId: 170000 },
    }
    const entry = await logCatalogFood(
      db,
      time.clock,
      userId,
      { date: '2026-11-22', meal: 'lunch' },
      onion,
      0.5,
    )
    expect(entry).toMatchObject({ servings: 0.5, kcal: 20, serving_size: 100, serving_unit: 'g' })
  })
})

// Phase 15: a plate of foods, recipes, and built-in items logged in one go.
describe('logPlate', () => {
  const at = { date: '2026-11-22', meal: 'lunch' } as const
  const onion = {
    id: 'onion',
    name: 'Onion',
    aliases: ['pyaz'],
    category: 'vegetables',
    servingSize: 100,
    servingUnit: 'g',
    kcal: 40,
    proteinG: 1.1,
    carbsG: 9.3,
    fatG: 0.1,
    source: { dataset: 'SR Legacy', fdcId: 170000 },
  }

  it('logs every item in order, with its values, in one go', async () => {
    const oats = await addOats()
    const recipe = await createRecipe(db, time.clock, userId, {
      name: 'Porridge',
      servings: 2,
      items: [{ foodId: oats.id, servings: 2 }],
    })

    const result = await logPlate(db, time.clock, userId, at, [
      { kind: 'saved', source: { kind: 'food', id: oats.id }, servings: 1.5 },
      { kind: 'saved', source: { kind: 'recipe', id: recipe.id }, servings: 1 },
      { kind: 'builtIn', item: onion, servings: 1.5 },
    ])

    expect(result.ok).toBe(true)
    const entries = await entriesOn(db, at.date)
    expect(entries.map((entry) => [entry.name, entry.servings, entry.kcal])).toEqual([
      ['Oats', 1.5, 225],
      ['Porridge', 1, 150],
      ['Onion', 1.5, 60],
    ])
    expect(entries.every((entry) => entry.meal === 'lunch')).toBe(true)
  })

  it('logs a built-in item you already copied with your copy’s values', async () => {
    const [copy] = (
      await logPlate(db, time.clock, userId, at, [{ kind: 'builtIn', item: onion, servings: 1 }])
    ).ok
      ? await db.rows('foods').toArray()
      : []
    if (!copy) throw new Error('no copy')
    await updateFood(db, time.clock, copy.id, {
      name: 'Red onion',
      servingSize: 100,
      servingUnit: 'g',
      kcal: 44,
      proteinG: 1.1,
      carbsG: 9.3,
      fatG: 0.1,
    })

    await logPlate(db, time.clock, userId, { ...at, meal: 'dinner' }, [
      { kind: 'builtIn', item: onion, servings: 1 },
    ])

    const dinner = (await entriesOn(db, at.date)).filter((entry) => entry.meal === 'dinner')
    expect(dinner.map((entry) => [entry.name, entry.kcal])).toEqual([['Red onion', 44]])
  })

  it('logs nothing when one item is past the database’s limits', async () => {
    const oats = await addOats()
    // 600 servings of 20 g carbs is 12000 g, past the 10000 g an entry holds.
    expect(
      await logPlate(db, time.clock, userId, at, [
        { kind: 'saved', source: { kind: 'food', id: oats.id }, servings: 1 },
        { kind: 'saved', source: { kind: 'food', id: oats.id }, servings: 600 },
      ]),
    ).toEqual({ ok: false, reason: 'too_large', index: 1 })
    expect(await entriesOn(db, at.date)).toEqual([])
  })

  it('logs nothing when an item is no longer stored, and copies no built-in item', async () => {
    expect(
      await logPlate(db, time.clock, userId, at, [
        { kind: 'builtIn', item: onion, servings: 1 },
        {
          kind: 'saved',
          source: { kind: 'food', id: 'b0000000-0000-4000-8000-0000000000ff' },
          servings: 1,
        },
      ]),
    ).toEqual({ ok: false, reason: 'not_found', index: 1 })
    expect(await entriesOn(db, at.date)).toEqual([])
    expect(await db.rows('foods').count()).toBe(0)
  })
})
