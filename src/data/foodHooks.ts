import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import type { CatalogFood } from './catalog/search'
import { useData } from './DataProvider'
import {
  copyCatalogFood,
  createFood,
  createRecipe,
  type FoodInput,
  type FoodView,
  foodById,
  listFoods,
  listRecipes,
  type RecipeDetail,
  type RecipeInput,
  type RecipeView,
  recipeDetail,
  setFoodArchived,
  setRecipeArchived,
  type UpdateResult,
  updateFood,
  updateRecipe,
} from './foods'

// Each list is undefined while loading. A single row is null when it isn't stored.
export const useFoods = (): FoodView[] | undefined => {
  const { ctx } = useData()
  return useLiveQuery(() => listFoods(ctx.db), [ctx.db])
}

export const useFood = (id: string): FoodView | null | undefined => {
  const { ctx } = useData()
  return useLiveQuery(() => foodById(ctx.db, id), [ctx.db, id])
}

export const useRecipes = (): RecipeView[] | undefined => {
  const { ctx } = useData()
  return useLiveQuery(() => listRecipes(ctx.db), [ctx.db])
}

export const useRecipe = (id: string): RecipeDetail | null | undefined => {
  const { ctx } = useData()
  return useLiveQuery(() => recipeDetail(ctx.db, id), [ctx.db, id])
}

export type FoodActions = {
  create: (input: FoodInput) => Promise<{ id: string }>
  update: (id: string, input: FoodInput) => Promise<UpdateResult<{ id: string }>>
  setArchived: (id: string, archived: boolean) => Promise<void>
  // A built-in item as one of your foods, copied the first time (decision 0027).
  copyBuiltIn: (item: CatalogFood) => Promise<{ id: string }>
}

export type RecipeActions = {
  create: (input: RecipeInput) => Promise<{ id: string }>
  update: (id: string, input: RecipeInput) => Promise<UpdateResult<{ id: string }>>
  setArchived: (id: string, archived: boolean) => Promise<void>
}

// Every write asks sync to run a few seconds later, as other writes do.
export const useFoodActions = (): FoodActions => {
  const { ctx, engine, userId } = useData()
  return useMemo(() => {
    const synced = async <T>(write: Promise<T>): Promise<T> => {
      const result = await write
      engine.request('write')
      return result
    }
    return {
      create: (input) => synced(createFood(ctx.db, ctx.clock, userId, input)),
      update: (id, input) => synced(updateFood(ctx.db, ctx.clock, id, input)),
      setArchived: (id, archived) => synced(setFoodArchived(ctx.db, ctx.clock, id, archived)),
      copyBuiltIn: (item) => synced(copyCatalogFood(ctx.db, ctx.clock, userId, item)),
    }
  }, [ctx, engine, userId])
}

export const useRecipeActions = (): RecipeActions => {
  const { ctx, engine, userId } = useData()
  return useMemo(() => {
    const synced = async <T>(write: Promise<T>): Promise<T> => {
      const result = await write
      engine.request('write')
      return result
    }
    return {
      create: (input) => synced(createRecipe(ctx.db, ctx.clock, userId, input)),
      update: (id, input) => synced(updateRecipe(ctx.db, ctx.clock, id, input)),
      setArchived: (id, archived) => synced(setRecipeArchived(ctx.db, ctx.clock, id, archived)),
    }
  }, [ctx, engine, userId])
}
