import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { dayId } from './dayId'
import type { LocalDb } from './db'
import { createFood, createRecipe, updateFood } from './foods'
import {
  changeServings,
  copyMealTo,
  dayComplete,
  entriesOn,
  logFood,
  logRecipe,
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
