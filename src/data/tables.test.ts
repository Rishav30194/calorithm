import { describe, expect, expectTypeOf, it } from 'vitest'

import type { Tables } from './database.types'
import {
  type DayRow,
  daysSpec,
  type FoodRow,
  foodsSpec,
  type LogEntryRow,
  logEntriesSpec,
  type ProfileRow,
  profileSpec,
  type RecipeItemRow,
  type RecipeRow,
  recipeItemsSpec,
  recipesSpec,
  syncedTables,
} from './tables'

const profile: ProfileRow = {
  id: 'a0000000-0000-4000-8000-000000000001',
  user_id: 'a0000000-0000-4000-8000-000000000001',
  height_cm: 180,
  birth_date: null,
  sex: null,
  activity_level: null,
  units: 'metric',
  goal_rate_kg_per_week: 0,
  protein_g_per_kg: 1.8,
  calorie_floor_kcal: 1200,
  updated_at: '2026-11-20T10:00:00.000001+00:00',
  client_updated_at: '2026-11-20T10:00:00.000Z',
  deleted_at: null,
  schema_version: 1,
}

describe('profileSpec', () => {
  it('parses to exactly the generated row type', () => {
    // Fails the type check if a migration changes the table without the schema following.
    expectTypeOf<ProfileRow>().toEqualTypeOf<Tables<'profile'>>()
  })

  it('accepts a valid row', () => {
    expect(profileSpec.parse(profile)).toEqual(profile)
  })

  it('rejects a row with a missing or mistyped column', () => {
    const { units: _, ...missing } = profile
    expect(profileSpec.parse(missing)).toBeNull()
    expect(profileSpec.parse({ ...profile, height_cm: '180' })).toBeNull()
  })

  it('drops columns the table does not have', () => {
    expect(profileSpec.parse({ ...profile, extra: true })).toEqual(profile)
  })
})

const syncColumns = {
  user_id: 'a0000000-0000-4000-8000-000000000001',
  updated_at: '2026-11-20T10:00:00.000001+00:00',
  client_updated_at: '2026-11-20T10:00:00.000Z',
  deleted_at: null,
  schema_version: 1,
}

const food: FoodRow = {
  ...syncColumns,
  id: 'f0000000-0000-4000-8000-000000000001',
  name: 'Oats',
  serving_size: 40,
  serving_unit: 'g',
  kcal: 150,
  protein_g: 5,
  archived_at: null,
}

const recipe: RecipeRow = {
  ...syncColumns,
  id: 'e0000000-0000-4000-8000-000000000001',
  name: 'Porridge',
  servings: 2,
  archived_at: null,
}

const recipeItem: RecipeItemRow = {
  ...syncColumns,
  id: 'c0000000-0000-4000-8000-000000000001',
  recipe_id: recipe.id,
  food_id: food.id,
  servings: 1.5,
}

const day: DayRow = {
  ...syncColumns,
  id: 'd0000000-0000-4000-8000-000000000001',
  date: '2026-11-20',
  complete: false,
}

const logEntry: LogEntryRow = {
  ...syncColumns,
  id: 'b0000000-0000-4000-8000-000000000001',
  date: '2026-11-20',
  meal: 'breakfast',
  food_id: food.id,
  recipe_id: null,
  servings: 1.5,
  name: 'Oats',
  kcal: 225,
  protein_g: 7.5,
  kcal_per_serving: 150,
  protein_g_per_serving: 5,
  logged_at: '2026-11-20T08:00:00.000Z',
}

describe('food and log table specs', () => {
  it('parse to exactly the generated row types', () => {
    expectTypeOf<FoodRow>().toEqualTypeOf<Tables<'foods'>>()
    expectTypeOf<RecipeRow>().toEqualTypeOf<Tables<'recipes'>>()
    expectTypeOf<RecipeItemRow>().toEqualTypeOf<Tables<'recipe_items'>>()
    expectTypeOf<DayRow>().toEqualTypeOf<Tables<'days'>>()
    expectTypeOf<LogEntryRow>().toEqualTypeOf<Tables<'log_entries'>>()
  })

  const cases = [
    { spec: foodsSpec, row: food, column: 'kcal' },
    { spec: recipesSpec, row: recipe, column: 'servings' },
    { spec: recipeItemsSpec, row: recipeItem, column: 'food_id' },
    { spec: daysSpec, row: day, column: 'complete' },
    { spec: logEntriesSpec, row: logEntry, column: 'meal' },
  ] as const

  it.each(cases)('$spec.name accepts a valid row', ({ spec, row }) => {
    expect(spec.parse(row)).toEqual(row)
  })

  it.each(cases)('$spec.name rejects a row missing $column', ({ spec, row, column }) => {
    const missing: Record<string, unknown> = { ...row }
    delete missing[column]
    expect(spec.parse(missing)).toBeNull()
  })
})

describe('parents', () => {
  it('names the rows a recipe item or log entry references', () => {
    expect(recipeItemsSpec.parents?.(recipeItem)).toEqual([
      { table: 'recipes', id: recipe.id },
      { table: 'foods', id: food.id },
    ])
    expect(logEntriesSpec.parents?.(logEntry)).toEqual([{ table: 'foods', id: food.id }])
    expect(logEntriesSpec.parents?.({ ...logEntry, food_id: null, recipe_id: recipe.id })).toEqual([
      { table: 'recipes', id: recipe.id },
    ])
  })
})

describe('values the columns can’t store', () => {
  // Rejected here rather than by the server, where the change would fail for good.
  it('rejects a fractional kcal', () => {
    expect(foodsSpec.parse({ ...food, kcal: 150.5 })).toBeNull()
    expect(logEntriesSpec.parse({ ...logEntry, kcal: 195.00000000000003 })).toBeNull()
  })

  it('rejects a date that isn’t YYYY-MM-DD', () => {
    expect(daysSpec.parse({ ...day, date: '20/11/2026' })).toBeNull()
    expect(logEntriesSpec.parse({ ...logEntry, date: '2026-11-20T00:30:00' })).toBeNull()
  })
})

describe('syncedTables', () => {
  it('lists each table once, parents before the tables that reference them', () => {
    const names = syncedTables.map((spec) => spec.name)
    expect(names).toEqual(['profile', 'foods', 'recipes', 'recipe_items', 'days', 'log_entries'])
    expect(new Set(names).size).toBe(names.length)
  })
})
