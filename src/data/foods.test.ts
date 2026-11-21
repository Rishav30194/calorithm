import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { LocalDb } from './db'
import { archiveFood, archiveRecipe, recipeIngredients, saveFood, saveRecipe } from './foods'
import { entriesOn, logFood } from './log'
import { closeAll, manualClock, openDb, userId } from './sync/testing/fixtures'
import { foodsSpec, recipeItemsSpec, recipesSpec } from './tables'

let db: LocalDb
let time: ReturnType<typeof manualClock>

beforeEach(() => {
  db = openDb('calorithm-test-foods')
  time = manualClock()
})

afterEach(closeAll)

const oats = { name: 'Oats', servingSize: 40, servingUnit: 'g', kcal: 150, proteinG: 5 }

const outboxFor = async (table: string) =>
  (await db.outbox.toArray()).filter((entry) => entry.table === table)

describe('saveFood', () => {
  it('creates a food with its outbox entry', async () => {
    const food = await saveFood(db, time.clock, userId, oats)

    expect(food).toMatchObject({
      user_id: userId,
      name: 'Oats',
      serving_size: 40,
      serving_unit: 'g',
      kcal: 150,
      protein_g: 5,
      archived_at: null,
      deleted_at: null,
    })
    expect((await outboxFor('foods')).map((entry) => entry.rowId)).toEqual([food.id])
  })

  it('trims text and rounds numbers to what the columns store', async () => {
    const food = await saveFood(db, time.clock, userId, {
      name: '  Greek yogurt ',
      servingSize: 170.456,
      servingUnit: ' g ',
      kcal: 99.6,
      proteinG: 17.25,
    })

    expect(food).toMatchObject({
      name: 'Greek yogurt',
      serving_size: 170.46,
      serving_unit: 'g',
      kcal: 100,
      protein_g: 17.3,
    })
  })

  it('updates an existing food in place', async () => {
    const food = await saveFood(db, time.clock, userId, oats)
    time.advance(60_000)

    const edited = await saveFood(db, time.clock, userId, { ...oats, kcal: 160 }, food.id)

    expect(edited.id).toBe(food.id)
    expect(foodsSpec.parse(await db.rows('foods').get(food.id))?.kcal).toBe(160)
    expect(await outboxFor('foods')).toHaveLength(1)
  })

  it('doesn’t change entries already logged (phase 3 criterion)', async () => {
    const food = await saveFood(db, time.clock, userId, oats)
    await logFood(db, time.clock, userId, {
      date: '2026-11-19',
      meal: 'breakfast',
      food,
      servings: 2,
    })

    await saveFood(db, time.clock, userId, { ...oats, name: 'Rolled oats', kcal: 400 }, food.id)

    const [entry] = await entriesOn(db, '2026-11-19')
    expect(entry).toMatchObject({ name: 'Oats', kcal: 300, proteinG: 10 })
  })
})

describe('archiveFood', () => {
  it('marks the food archived without deleting it', async () => {
    const food = await saveFood(db, time.clock, userId, oats)

    await archiveFood(db, time.clock, food.id)

    const stored = foodsSpec.parse(await db.rows('foods').get(food.id))
    expect(stored?.archived_at).toBe('2026-11-20T10:00:00.000Z')
    expect(stored?.deleted_at).toBeNull()
  })
})

describe('saveRecipe', () => {
  it('writes the recipe and its items together', async () => {
    const food = await saveFood(db, time.clock, userId, oats)
    const milk = await saveFood(db, time.clock, userId, {
      name: 'Milk',
      servingSize: 100,
      servingUnit: 'ml',
      kcal: 65,
      proteinG: 3.4,
    })

    const recipe = await saveRecipe(db, time.clock, userId, {
      name: 'Porridge',
      servings: 4,
      items: [
        { foodId: food.id, servings: 2 },
        { foodId: milk.id, servings: 3 },
      ],
    })

    expect(recipesSpec.parse(await db.rows('recipes').get(recipe.id))?.servings).toBe(4)
    // Items come back in id order; totals don't depend on order.
    const ingredients = await recipeIngredients(db, recipe.id)
    expect(ingredients).toHaveLength(2)
    expect(ingredients).toEqual(
      expect.arrayContaining([
        { perServing: { kcal: 150, proteinG: 5 }, servings: 2 },
        { perServing: { kcal: 65, proteinG: 3.4 }, servings: 3 },
      ]),
    )
    expect(await outboxFor('recipe_items')).toHaveLength(2)
  })

  it('soft deletes items left out when the recipe is saved again', async () => {
    const food = await saveFood(db, time.clock, userId, oats)
    const milk = await saveFood(db, time.clock, userId, { ...oats, name: 'Milk' })
    const recipe = await saveRecipe(db, time.clock, userId, {
      name: 'Porridge',
      servings: 2,
      items: [
        { foodId: food.id, servings: 1 },
        { foodId: milk.id, servings: 1 },
      ],
    })

    await saveRecipe(
      db,
      time.clock,
      userId,
      { name: 'Porridge', servings: 2, items: [{ foodId: food.id, servings: 1.5 }] },
      recipe.id,
    )

    const items = (await db.rows('recipe_items').toArray()).flatMap((raw) => {
      const item = recipeItemsSpec.parse(raw)
      return item ? [item] : []
    })
    expect(items.filter((item) => item.deleted_at === null)).toEqual([
      expect.objectContaining({ food_id: food.id, servings: 1.5 }),
    ])
    expect(items.filter((item) => item.deleted_at !== null)).toEqual([
      expect.objectContaining({ food_id: milk.id }),
    ])
  })
})

describe('archiveRecipe', () => {
  it('marks the recipe archived', async () => {
    const recipe = await saveRecipe(db, time.clock, userId, {
      name: 'Water',
      servings: 1,
      items: [],
    })

    await archiveRecipe(db, time.clock, recipe.id)

    expect(recipesSpec.parse(await db.rows('recipes').get(recipe.id))?.archived_at).not.toBeNull()
  })
})
