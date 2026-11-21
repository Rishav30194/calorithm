import { type Ingredient, roundKcal, roundProtein, roundServings } from '@/domain/nutrition'

import type { LocalDb } from './db'
import { type Clock, writeRow } from './repository'
import {
  type FoodRow,
  foodsSpec,
  type RecipeItemRow,
  type RecipeRow,
  recipeItemsSpec,
  recipesSpec,
} from './tables'

// Already parsed by the form: present, in range, and with at least one character of text.
export type FoodInput = {
  name: string
  servingSize: number
  servingUnit: string
  kcal: number
  proteinG: number
}

export type RecipeInput = {
  name: string
  servings: number
  items: { foodId: string; servings: number }[]
}

const syncDefaults = (userId: string) => ({
  user_id: userId,
  updated_at: '',
  client_updated_at: '',
  deleted_at: null,
  schema_version: 1,
})

export const saveFood = async (
  db: LocalDb,
  clock: Clock,
  userId: string,
  input: FoodInput,
  id?: string,
): Promise<FoodRow> => {
  const existing = id ? foodsSpec.parse(await db.rows('foods').get(id)) : null
  return writeRow(
    db,
    foodsSpec,
    {
      ...syncDefaults(userId),
      archived_at: null,
      ...existing,
      id: existing?.id ?? crypto.randomUUID(),
      name: input.name.trim(),
      serving_size: roundServings(input.servingSize),
      serving_unit: input.servingUnit.trim(),
      kcal: roundKcal(input.kcal),
      protein_g: roundProtein(input.proteinG),
    },
    clock,
  )
}

export const archiveFood = async (db: LocalDb, clock: Clock, id: string): Promise<void> => {
  const food = foodsSpec.parse(await db.rows('foods').get(id))
  if (food) await writeRow(db, foodsSpec, { ...food, archived_at: clock().toISOString() }, clock)
}

const liveItems = async (db: LocalDb, recipeId: string): Promise<RecipeItemRow[]> =>
  (await db.rows('recipe_items').where('recipe_id').equals(recipeId).toArray()).flatMap((raw) => {
    const item = recipeItemsSpec.parse(raw)
    return item && item.deleted_at === null ? [item] : []
  })

// Writes the recipe and its items in one transaction. Items keep their ids when the same food
// stays in the recipe; items left out are soft deleted.
export const saveRecipe = (
  db: LocalDb,
  clock: Clock,
  userId: string,
  input: RecipeInput,
  id?: string,
): Promise<RecipeRow> =>
  db.transaction('rw', db.rows('recipes'), db.rows('recipe_items'), db.outbox, async () => {
    const existing = id ? recipesSpec.parse(await db.rows('recipes').get(id)) : null
    const recipe = await writeRow(
      db,
      recipesSpec,
      {
        ...syncDefaults(userId),
        archived_at: null,
        ...existing,
        id: existing?.id ?? crypto.randomUUID(),
        name: input.name.trim(),
        servings: roundServings(input.servings),
      },
      clock,
    )

    const unused = await liveItems(db, recipe.id)
    for (const { foodId, servings } of input.items) {
      const index = unused.findIndex((item) => item.food_id === foodId)
      const [reused] = index >= 0 ? unused.splice(index, 1) : []
      await writeRow(
        db,
        recipeItemsSpec,
        {
          ...syncDefaults(userId),
          ...reused,
          id: reused?.id ?? crypto.randomUUID(),
          recipe_id: recipe.id,
          food_id: foodId,
          servings: roundServings(servings),
        },
        clock,
      )
    }
    for (const removed of unused) {
      await writeRow(db, recipeItemsSpec, { ...removed, deleted_at: clock().toISOString() }, clock)
    }
    return recipe
  })

export const archiveRecipe = async (db: LocalDb, clock: Clock, id: string): Promise<void> => {
  const recipe = recipesSpec.parse(await db.rows('recipes').get(id))
  if (recipe) {
    await writeRow(db, recipesSpec, { ...recipe, archived_at: clock().toISOString() }, clock)
  }
}

// A recipe's ingredients with each food's current values. A food deleted since is left out.
export const recipeIngredients = async (db: LocalDb, recipeId: string): Promise<Ingredient[]> => {
  const items = await liveItems(db, recipeId)
  const ingredients: Ingredient[] = []
  for (const item of items) {
    const food = foodsSpec.parse(await db.rows('foods').get(item.food_id))
    if (food && food.deleted_at === null) {
      ingredients.push({
        perServing: { kcal: food.kcal, proteinG: food.protein_g },
        servings: item.servings,
      })
    }
  }
  return ingredients
}
