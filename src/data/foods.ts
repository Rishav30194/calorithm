import {
  type Ingredient,
  type Nutrients,
  recipePerServing,
  recipeTotals,
  roundGrams,
  roundKcal,
  roundProtein,
  roundServings,
  scaleNutrients,
} from '@/domain/nutrition'

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
  carbsG: number
  fatG: number
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

export type UpdateResult<Row> = { ok: true; row: Row } | { ok: false; reason: 'not_found' }

const foodFields = (input: FoodInput) => ({
  name: input.name.trim(),
  serving_size: roundServings(input.servingSize),
  serving_unit: input.servingUnit.trim(),
  kcal: roundKcal(input.kcal),
  protein_g: roundProtein(input.proteinG),
  carbs_g: roundGrams(input.carbsG),
  fat_g: roundGrams(input.fatG),
})

// A food's values per serving, as the calculations take them.
export const foodNutrients = (food: FoodRow): Nutrients => ({
  kcal: food.kcal,
  proteinG: food.protein_g,
  carbsG: food.carbs_g,
  fatG: food.fat_g,
})

export const createFood = (
  db: LocalDb,
  clock: Clock,
  userId: string,
  input: FoodInput,
): Promise<FoodRow> =>
  writeRow(
    db,
    foodsSpec,
    {
      ...syncDefaults(userId),
      id: crypto.randomUUID(),
      archived_at: null,
      ...foodFields(input),
    },
    clock,
  )

// A row missing locally, for example removed by a pull, is reported rather than recreated.
export const updateFood = async (
  db: LocalDb,
  clock: Clock,
  id: string,
  input: FoodInput,
): Promise<UpdateResult<FoodRow>> => {
  const existing = foodsSpec.parse(await db.rows('foods').get(id))
  if (!existing) return { ok: false, reason: 'not_found' }
  return {
    ok: true,
    row: await writeRow(db, foodsSpec, { ...existing, ...foodFields(input) }, clock),
  }
}

// Archived rows stay on past entries and recipes but leave the pickers; restoring brings them back.
export const setFoodArchived = async (
  db: LocalDb,
  clock: Clock,
  id: string,
  archived: boolean,
): Promise<void> => {
  const food = foodsSpec.parse(await db.rows('foods').get(id))
  if (!food) return
  const archivedAt = archived ? clock().toISOString() : null
  await writeRow(db, foodsSpec, { ...food, archived_at: archivedAt }, clock)
}

const liveItems = async (db: LocalDb, recipeId: string): Promise<RecipeItemRow[]> =>
  (await db.rows('recipe_items').where('recipe_id').equals(recipeId).toArray()).flatMap((raw) => {
    const item = recipeItemsSpec.parse(raw)
    return item && item.deleted_at === null ? [item] : []
  })

// Writes the recipe and its items in one transaction. Items keep their ids when the same food
// stays in the recipe; items left out are soft deleted.
const writeRecipe = (
  db: LocalDb,
  clock: Clock,
  draft: RecipeRow,
  items: RecipeInput['items'],
): Promise<RecipeRow> =>
  db.transaction(
    'rw',
    db.rows('recipes'),
    db.rows('recipe_items'),
    db.rows('foods'),
    db.outbox,
    async () => {
      const recipe = await writeRow(db, recipesSpec, draft, clock)
      const unused = await liveItems(db, recipe.id)
      for (const { foodId, servings } of items) {
        const index = unused.findIndex((item) => item.food_id === foodId)
        const [reused] = index >= 0 ? unused.splice(index, 1) : []
        await writeRow(
          db,
          recipeItemsSpec,
          {
            ...syncDefaults(recipe.user_id),
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
        // An item whose food was deleted elsewhere never reached the editor, so leaving it out of
        // the input doesn't mean the user removed it.
        const food = foodsSpec.parse(await db.rows('foods').get(removed.food_id))
        if (!food || food.deleted_at !== null) continue
        await writeRow(
          db,
          recipeItemsSpec,
          { ...removed, deleted_at: clock().toISOString() },
          clock,
        )
      }
      return recipe
    },
  )

const recipeFields = (input: RecipeInput) => ({
  name: input.name.trim(),
  servings: roundServings(input.servings),
})

export const createRecipe = (
  db: LocalDb,
  clock: Clock,
  userId: string,
  input: RecipeInput,
): Promise<RecipeRow> =>
  writeRecipe(
    db,
    clock,
    { ...syncDefaults(userId), id: crypto.randomUUID(), archived_at: null, ...recipeFields(input) },
    input.items,
  )

export const updateRecipe = async (
  db: LocalDb,
  clock: Clock,
  id: string,
  input: RecipeInput,
): Promise<UpdateResult<RecipeRow>> => {
  const existing = recipesSpec.parse(await db.rows('recipes').get(id))
  if (!existing) return { ok: false, reason: 'not_found' }
  return {
    ok: true,
    row: await writeRecipe(db, clock, { ...existing, ...recipeFields(input) }, input.items),
  }
}

export const setRecipeArchived = async (
  db: LocalDb,
  clock: Clock,
  id: string,
  archived: boolean,
): Promise<void> => {
  const recipe = recipesSpec.parse(await db.rows('recipes').get(id))
  if (!recipe) return
  const archivedAt = archived ? clock().toISOString() : null
  await writeRow(db, recipesSpec, { ...recipe, archived_at: archivedAt }, clock)
}

// A recipe's ingredients with each food's current values. A food deleted since is left out.
export const recipeIngredients = async (db: LocalDb, recipeId: string): Promise<Ingredient[]> => {
  const items = await liveItems(db, recipeId)
  const ingredients: Ingredient[] = []
  for (const item of items) {
    const food = foodsSpec.parse(await db.rows('foods').get(item.food_id))
    if (food && food.deleted_at === null) {
      ingredients.push({
        perServing: foodNutrients(food),
        servings: item.servings,
      })
    }
  }
  return ingredients
}

// What the screens see: no sync columns, and numbers ready to format.
export type FoodView = {
  id: string
  name: string
  servingSize: number
  servingUnit: string
  kcal: number
  proteinG: number
  // Null when not set, on foods saved before carbs and fat existed.
  carbsG: number | null
  fatG: number | null
  archived: boolean
}

export type RecipeItemView = {
  foodId: string
  name: string
  servingSize: number
  servingUnit: string
  servings: number
  perServing: Nutrients
}

export type RecipeView = {
  id: string
  name: string
  servings: number
  archived: boolean
  totals: Nutrients
  perServing: Nutrients
}

export type RecipeDetail = RecipeView & { items: RecipeItemView[] }

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })

const toFoodView = (food: FoodRow): FoodView => ({
  id: food.id,
  name: food.name,
  servingSize: food.serving_size,
  servingUnit: food.serving_unit,
  kcal: food.kcal,
  proteinG: food.protein_g,
  carbsG: food.carbs_g,
  fatG: food.fat_g,
  archived: food.archived_at !== null,
})

const liveFoods = async (db: LocalDb): Promise<FoodRow[]> =>
  (await db.rows('foods').toArray()).flatMap((raw) => {
    const food = foodsSpec.parse(raw)
    return food && food.deleted_at === null ? [food] : []
  })

export const listFoods = async (db: LocalDb): Promise<FoodView[]> =>
  (await liveFoods(db)).map(toFoodView).sort(byName)

export const foodById = async (db: LocalDb, id: string): Promise<FoodView | null> => {
  const food = foodsSpec.parse(await db.rows('foods').get(id))
  return food && food.deleted_at === null ? toFoodView(food) : null
}

const foodMap = async (db: LocalDb): Promise<Map<string, FoodRow>> =>
  new Map((await liveFoods(db)).map((food) => [food.id, food]))

const recipeView = async (
  db: LocalDb,
  recipe: RecipeRow,
  foods: Map<string, FoodRow>,
): Promise<RecipeDetail> => {
  const items = (await liveItems(db, recipe.id))
    .flatMap((item): RecipeItemView[] => {
      const food = foods.get(item.food_id)
      return food
        ? [
            {
              foodId: food.id,
              name: food.name,
              servingSize: food.serving_size,
              servingUnit: food.serving_unit,
              servings: item.servings,
              perServing: foodNutrients(food),
            },
          ]
        : []
    })
    .sort(byName)
  return {
    id: recipe.id,
    name: recipe.name,
    servings: recipe.servings,
    archived: recipe.archived_at !== null,
    totals: recipeTotals(items),
    perServing: scaleNutrients(recipePerServing(items, recipe.servings), 1),
    items,
  }
}

export const listRecipes = async (db: LocalDb): Promise<RecipeView[]> => {
  const recipes = (await db.rows('recipes').toArray()).flatMap((raw) => {
    const recipe = recipesSpec.parse(raw)
    return recipe && recipe.deleted_at === null ? [recipe] : []
  })
  // Foods are read once for the whole list, not once per recipe.
  const foods = await foodMap(db)
  const views: RecipeView[] = []
  for (const recipe of recipes) {
    const { items: _, ...view } = await recipeView(db, recipe, foods)
    views.push(view)
  }
  return views.sort(byName)
}

export const recipeDetail = async (db: LocalDb, id: string): Promise<RecipeDetail | null> => {
  const recipe = recipesSpec.parse(await db.rows('recipes').get(id))
  return recipe && recipe.deleted_at === null ? recipeView(db, recipe, await foodMap(db)) : null
}
