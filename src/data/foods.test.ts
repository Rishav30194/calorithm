import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { LocalDb } from './db'
import {
  copyCatalogFood,
  createFood,
  createRecipe,
  findFoodsByBarcode,
  listFoods,
  listRecipes,
  recipeDetail,
  recipeIngredients,
  setFoodArchived,
  setRecipeArchived,
  updateFood,
  updateRecipe,
} from './foods'
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

const oats = {
  name: 'Oats',
  servingSize: 40,
  servingUnit: 'g',
  kcal: 150,
  proteinG: 5,
  carbsG: 20,
  fatG: 3,
}

const outboxFor = async (table: string) =>
  (await db.outbox.toArray()).filter((entry) => entry.table === table)

describe('createFood and updateFood', () => {
  it('creates a food with its outbox entry', async () => {
    const food = await createFood(db, time.clock, userId, oats)

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
    const food = await createFood(db, time.clock, userId, {
      name: '  Greek yogurt ',
      servingSize: 170.456,
      servingUnit: ' g ',
      kcal: 99.6,
      proteinG: 17.25,
      carbsG: 20,
      fatG: 3,
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
    const food = await createFood(db, time.clock, userId, oats)
    time.advance(60_000)

    const edited = await updateFood(db, time.clock, food.id, { ...oats, kcal: 160 })

    expect(edited.ok && edited.row.id).toBe(food.id)
    expect(foodsSpec.parse(await db.rows('foods').get(food.id))?.kcal).toBe(160)
    expect(await outboxFor('foods')).toHaveLength(1)
  })

  it('doesn’t change entries already logged (phase 3 criterion)', async () => {
    const food = await createFood(db, time.clock, userId, oats)
    await logFood(db, time.clock, userId, {
      date: '2026-11-19',
      meal: 'breakfast',
      food,
      servings: 2,
    })

    await updateFood(db, time.clock, food.id, { ...oats, name: 'Rolled oats', kcal: 400 })

    const [entry] = await entriesOn(db, '2026-11-19')
    expect(entry).toMatchObject({ name: 'Oats', kcal: 300, proteinG: 10 })
  })
})

describe('updating a row that isn’t stored', () => {
  it('reports it instead of creating a new row', async () => {
    const missing = 'f0000000-0000-4000-8000-0000000000ff'
    expect(await updateFood(db, time.clock, missing, oats)).toEqual({
      ok: false,
      reason: 'not_found',
    })
    expect(
      await updateRecipe(db, time.clock, missing, { name: 'Gone', servings: 1, items: [] }),
    ).toEqual({ ok: false, reason: 'not_found' })
    expect(await db.rows('foods').count()).toBe(0)
    expect(await db.rows('recipes').count()).toBe(0)
  })
})

describe('setFoodArchived', () => {
  it('marks the food archived without deleting it', async () => {
    const food = await createFood(db, time.clock, userId, oats)

    await setFoodArchived(db, time.clock, food.id, true)

    const stored = foodsSpec.parse(await db.rows('foods').get(food.id))
    expect(stored?.archived_at).toBe('2026-11-20T10:00:00.000Z')
    expect(stored?.deleted_at).toBeNull()
  })

  it('restores an archived food', async () => {
    const food = await createFood(db, time.clock, userId, oats)
    await setFoodArchived(db, time.clock, food.id, true)

    await setFoodArchived(db, time.clock, food.id, false)

    expect(foodsSpec.parse(await db.rows('foods').get(food.id))?.archived_at).toBeNull()
  })
})

describe('createRecipe and updateRecipe', () => {
  it('writes the recipe and its items together', async () => {
    const food = await createFood(db, time.clock, userId, oats)
    const milk = await createFood(db, time.clock, userId, {
      name: 'Milk',
      servingSize: 100,
      servingUnit: 'ml',
      kcal: 65,
      proteinG: 3.4,
      carbsG: 20,
      fatG: 3,
    })

    const recipe = await createRecipe(db, time.clock, userId, {
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
        { perServing: { kcal: 150, proteinG: 5, carbsG: 20, fatG: 3 }, servings: 2 },
        { perServing: { kcal: 65, proteinG: 3.4, carbsG: 20, fatG: 3 }, servings: 3 },
      ]),
    )
    expect(await outboxFor('recipe_items')).toHaveLength(2)
  })

  it('soft deletes items left out when the recipe is saved again', async () => {
    const food = await createFood(db, time.clock, userId, oats)
    const milk = await createFood(db, time.clock, userId, { ...oats, name: 'Milk' })
    const recipe = await createRecipe(db, time.clock, userId, {
      name: 'Porridge',
      servings: 2,
      items: [
        { foodId: food.id, servings: 1 },
        { foodId: milk.id, servings: 1 },
      ],
    })

    await updateRecipe(db, time.clock, recipe.id, {
      name: 'Porridge',
      servings: 2,
      items: [{ foodId: food.id, servings: 1.5 }],
    })

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

describe('setRecipeArchived', () => {
  it('archives and restores the recipe', async () => {
    const recipe = await createRecipe(db, time.clock, userId, {
      name: 'Water',
      servings: 1,
      items: [],
    })

    await setRecipeArchived(db, time.clock, recipe.id, true)
    expect(recipesSpec.parse(await db.rows('recipes').get(recipe.id))?.archived_at).not.toBeNull()

    await setRecipeArchived(db, time.clock, recipe.id, false)
    expect(recipesSpec.parse(await db.rows('recipes').get(recipe.id))?.archived_at).toBeNull()
  })
})

describe('barcodes', () => {
  const paneer = { ...oats, name: 'Paneer', barcode: '8901234567890' }

  it('saves a barcode, and no barcode when none is given', async () => {
    expect(await createFood(db, time.clock, userId, paneer)).toMatchObject({
      barcode: '8901234567890',
    })
    expect(await createFood(db, time.clock, userId, oats)).toMatchObject({ barcode: null })
  })

  it('changes a barcode, and keeps it when an edit gives none (decision 0025)', async () => {
    const food = await createFood(db, time.clock, userId, paneer)

    await updateFood(db, time.clock, food.id, { ...paneer, barcode: '96385074' })
    expect(foodsSpec.parse(await db.rows('foods').get(food.id))?.barcode).toBe('96385074')

    await updateFood(db, time.clock, food.id, { ...oats, name: 'Paneer' })
    expect(foodsSpec.parse(await db.rows('foods').get(food.id))?.barcode).toBe('96385074')
  })

  it('finds your foods with a barcode: active ones by name, then archived ones', async () => {
    const block = await createFood(db, time.clock, userId, paneer)
    const archived = await createFood(db, time.clock, userId, { ...paneer, name: 'Old paneer' })
    await setFoodArchived(db, time.clock, archived.id, true)
    await createFood(db, time.clock, userId, { ...paneer, name: 'cubes' })
    const deleted = await createFood(db, time.clock, userId, { ...paneer, name: 'Gone' })
    await db.rows('foods').update(deleted.id, { deleted_at: '2026-11-20T10:00:00.000Z' })
    await createFood(db, time.clock, userId, { ...paneer, barcode: '96385074' })
    await createFood(db, time.clock, userId, oats)

    const found = await findFoodsByBarcode(db, '8901234567890')

    expect(found.map((food) => [food.name, food.archived])).toEqual([
      ['cubes', false],
      ['Paneer', false],
      ['Old paneer', true],
    ])
    expect(found[1]).toMatchObject({ id: block.id, barcode: '8901234567890' })
    expect(await findFoodsByBarcode(db, '0000000000017')).toEqual([])
  })

  it('finds a food from any form of its barcode, and nothing for an invalid one', async () => {
    const food = await createFood(db, time.clock, userId, { ...paneer, barcode: '0036000291452' })

    expect((await findFoodsByBarcode(db, '036000 291452')).map(({ id }) => id)).toEqual([food.id])
    expect(await findFoodsByBarcode(db, '036000291453')).toEqual([])
  })
})

describe('reading foods and recipes for the screens', () => {
  it('lists foods by name, archived ones included and marked, deleted ones left out', async () => {
    await createFood(db, time.clock, userId, { ...oats, name: 'yogurt' })
    const archived = await createFood(db, time.clock, userId, { ...oats, name: 'Bread' })
    await setFoodArchived(db, time.clock, archived.id, true)
    const deleted = await createFood(db, time.clock, userId, { ...oats, name: 'Gone' })
    await db.rows('foods').update(deleted.id, { deleted_at: '2026-11-20T10:00:00.000Z' })
    await createFood(db, time.clock, userId, oats)

    const foods = await listFoods(db)

    expect(foods.map((food) => [food.name, food.archived])).toEqual([
      ['Bread', true],
      ['Oats', false],
      ['yogurt', false],
    ])
    expect(foods[1]).toMatchObject({ servingSize: 40, servingUnit: 'g', kcal: 150, proteinG: 5 })
  })

  it('gives each recipe its totals and per-serving values', async () => {
    const food = await createFood(db, time.clock, userId, oats)
    await createRecipe(db, time.clock, userId, {
      name: 'Porridge',
      servings: 4,
      items: [{ foodId: food.id, servings: 3 }],
    })

    expect(await listRecipes(db)).toEqual([
      expect.objectContaining({
        name: 'Porridge',
        servings: 4,
        archived: false,
        totals: { kcal: 450, proteinG: 15, carbsG: 60, fatG: 9 },
        perServing: { kcal: 113, proteinG: 3.8, carbsG: 15, fatG: 2.3 },
        // Phase 16: the ingredients, for logging the recipe as them.
        ingredients: [{ foodId: food.id, servings: 3 }],
      }),
    ])
  })

  it('details a recipe’s ingredients sorted by food name', async () => {
    const zucchini = await createFood(db, time.clock, userId, { ...oats, name: 'Zucchini' })
    const apple = await createFood(db, time.clock, userId, { ...oats, name: 'apple' })
    const recipe = await createRecipe(db, time.clock, userId, {
      name: 'Mix',
      servings: 1,
      items: [
        { foodId: zucchini.id, servings: 1 },
        { foodId: apple.id, servings: 2 },
      ],
    })

    const detail = await recipeDetail(db, recipe.id)

    expect(detail?.items.map((item) => [item.name, item.servings])).toEqual([
      ['apple', 2],
      ['Zucchini', 1],
    ])
    expect(await recipeDetail(db, 'e0000000-0000-4000-8000-0000000000ff')).toBeNull()
  })
})

describe('saving a recipe whose ingredient’s food was deleted elsewhere', () => {
  it('leaves that ingredient alone, since the editor never showed it', async () => {
    const oatsFood = await createFood(db, time.clock, userId, oats)
    const gone = await createFood(db, time.clock, userId, { ...oats, name: 'Gone' })
    const recipe = await createRecipe(db, time.clock, userId, {
      name: 'Mix',
      servings: 1,
      items: [
        { foodId: oatsFood.id, servings: 1 },
        { foodId: gone.id, servings: 1 },
      ],
    })
    await db.rows('foods').update(gone.id, { deleted_at: '2026-11-20T10:00:00.000Z' })
    const shown = await recipeDetail(db, recipe.id)
    expect(shown?.items.map((item) => item.name)).toEqual(['Oats'])

    await updateRecipe(db, time.clock, recipe.id, {
      name: 'Mix renamed',
      servings: 1,
      items: [{ foodId: oatsFood.id, servings: 1 }],
    })

    const items = (await db.rows('recipe_items').toArray()).flatMap((raw) => {
      const item = recipeItemsSpec.parse(raw)
      return item ? [item] : []
    })
    expect(items.find((item) => item.food_id === gone.id)?.deleted_at).toBeNull()
  })
})

describe('copyCatalogFood (phase 14)', () => {
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

  it('copies a built-in item into your foods once, and reuses the copy after', async () => {
    const first = await copyCatalogFood(db, time.clock, userId, onion)
    const second = await copyCatalogFood(db, time.clock, userId, onion)

    expect(second.id).toBe(first.id)
    expect(await listFoods(db)).toEqual([
      expect.objectContaining({ name: 'Onion', catalogId: 'onion', kcal: 40, servingUnit: 'g' }),
    ])
  })

  it('brings an archived copy back instead of making another', async () => {
    const copy = await copyCatalogFood(db, time.clock, userId, onion)
    await setFoodArchived(db, time.clock, copy.id, true)

    expect((await copyCatalogFood(db, time.clock, userId, onion)).id).toBe(copy.id)
    expect(await listFoods(db)).toEqual([expect.objectContaining({ id: copy.id, archived: false })])
  })
})
