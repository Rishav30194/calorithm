import { describe, expect, expectTypeOf, it } from 'vitest'

import type { Tables } from './database.types'
import {
  type CheckinRow,
  checkinsSpec,
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
  type WeightRow,
  weightsSpec,
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

const weight: WeightRow = {
  ...syncColumns,
  id: '90000000-0000-4000-8000-000000000001',
  date: '2026-11-20',
  weight_kg: 82.4,
}

const checkin: CheckinRow = {
  ...syncColumns,
  id: '8c3ca5ea-8894-5508-a86e-24807ecfb92b',
  date: '2026-11-20',
  status: 'updated',
  skip_reason: null,
  method: 'adaptive',
  previous_maintenance_kcal: 2500,
  raw_maintenance_kcal: 2400,
  maintenance_kcal: 2450,
  kcal_target: 1900,
  protein_target_g: 147.6,
  trend_weight_kg: 82,
  trend_change_kg: -1.2,
  window_days: 28,
  complete_days_in_window: 24,
  average_intake_kcal: 2120,
  complete_days_in_week: 6,
  goal_rate_requested_kg_per_week: -0.5,
  goal_rate_applied_kg_per_week: -0.5,
  protein_g_per_kg: 1.8,
  calorie_floor_kcal: 1200,
  floor_applied: false,
  rate_capped: false,
}

const skipped: CheckinRow = {
  ...checkin,
  status: 'skipped',
  skip_reason: 'too_few_complete_days',
  method: null,
  raw_maintenance_kcal: null,
}

describe('food and log table specs', () => {
  it('parse to exactly the generated row types', () => {
    expectTypeOf<FoodRow>().toEqualTypeOf<Tables<'foods'>>()
    expectTypeOf<RecipeRow>().toEqualTypeOf<Tables<'recipes'>>()
    expectTypeOf<RecipeItemRow>().toEqualTypeOf<Tables<'recipe_items'>>()
    expectTypeOf<DayRow>().toEqualTypeOf<Tables<'days'>>()
    expectTypeOf<LogEntryRow>().toEqualTypeOf<Tables<'log_entries'>>()
    expectTypeOf<WeightRow>().toEqualTypeOf<Tables<'weights'>>()
    expectTypeOf<CheckinRow>().toEqualTypeOf<Tables<'checkins'>>()
  })

  const cases = [
    { spec: foodsSpec, row: food, column: 'kcal' },
    { spec: recipesSpec, row: recipe, column: 'servings' },
    { spec: recipeItemsSpec, row: recipeItem, column: 'food_id' },
    { spec: daysSpec, row: day, column: 'complete' },
    { spec: logEntriesSpec, row: logEntry, column: 'meal' },
    { spec: weightsSpec, row: weight, column: 'weight_kg' },
    { spec: checkinsSpec, row: checkin, column: 'kcal_target' },
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
    expect(weightsSpec.parse({ ...weight, date: '20/11/2026' })).toBeNull()
  })

  it('rejects a weigh-in dated before 2000, as the database does', () => {
    expect(weightsSpec.parse({ ...weight, date: '1999-12-31' })).toBeNull()
    expect(weightsSpec.parse({ ...weight, date: '2000-01-01' })).toEqual({
      ...weight,
      date: '2000-01-01',
    })
  })

  it('rejects a weight outside 20 to 400 kg', () => {
    expect(weightsSpec.parse({ ...weight, weight_kg: 19.99 })).toBeNull()
    expect(weightsSpec.parse({ ...weight, weight_kg: 400.01 })).toBeNull()
    expect(weightsSpec.parse({ ...weight, weight_kg: 20 })).toEqual({ ...weight, weight_kg: 20 })
    expect(weightsSpec.parse({ ...weight, weight_kg: 400 })).toEqual({ ...weight, weight_kg: 400 })
  })

  it('rejects a weight that isn’t a finite number with at most 2 decimals', () => {
    for (const weight_kg of [Number.NaN, Number.POSITIVE_INFINITY, '82.4', null, 82.345]) {
      expect(weightsSpec.parse({ ...weight, weight_kg })).toBeNull()
    }
    expect(weightsSpec.parse({ ...weight, weight_kg: 82.35 })).toEqual({
      ...weight,
      weight_kg: 82.35,
    })
  })
})

describe('checkinsSpec', () => {
  it('accepts an updated and a skipped check-in', () => {
    expect(checkinsSpec.parse(checkin)).toEqual(checkin)
    expect(checkinsSpec.parse(skipped)).toEqual(skipped)
  })

  it('rejects a status, skip reason, or method the database doesn’t allow', () => {
    expect(checkinsSpec.parse({ ...checkin, status: 'done' })).toBeNull()
    expect(checkinsSpec.parse({ ...skipped, skip_reason: 'no_weigh_ins' })).toBeNull()
    expect(checkinsSpec.parse({ ...checkin, method: 'guess' })).toBeNull()
  })

  it('rejects an updated check-in without a method, or a skipped one without a reason', () => {
    expect(checkinsSpec.parse({ ...checkin, method: null })).toBeNull()
    expect(checkinsSpec.parse({ ...skipped, skip_reason: null })).toBeNull()
    expect(checkinsSpec.parse({ ...checkin, skip_reason: 'too_few_complete_days' })).toBeNull()
  })

  it('rejects values the columns can’t store', () => {
    expect(checkinsSpec.parse({ ...checkin, kcal_target: 1900.5 })).toBeNull()
    expect(checkinsSpec.parse({ ...checkin, maintenance_kcal: 2450.5 })).toBeNull()
    expect(checkinsSpec.parse({ ...checkin, protein_target_g: 147.65 })).toBeNull()
    expect(checkinsSpec.parse({ ...checkin, trend_weight_kg: 82.005 })).toBeNull()
    expect(checkinsSpec.parse({ ...checkin, complete_days_in_week: 6.5 })).toBeNull()
    expect(checkinsSpec.parse({ ...checkin, date: '1999-12-31' })).toBeNull()
  })
})

describe('syncedTables', () => {
  it('lists each table once, parents before the tables that reference them', () => {
    const names = syncedTables.map((spec) => spec.name)
    expect(names).toEqual([
      'profile',
      'foods',
      'recipes',
      'recipe_items',
      'days',
      'log_entries',
      'weights',
      'checkins',
    ])
    expect(new Set(names).size).toBe(names.length)
  })
})
