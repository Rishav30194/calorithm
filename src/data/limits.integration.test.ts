import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'

import { MAX_HIGHER_DAYS_MASK, MAX_HIGHER_KCAL_EXTRA } from '@/domain/calorieDays'
import { limits } from '@/domain/limits'
import type { Database, TablesInsert } from './database.types'

// Checks each value in src/domain/limits.ts against the database's CHECK constraints: the
// limit itself is accepted and the next step past it refused. Runs against local Supabase
// through `npm run test:integration`, as its own synthetic user, since nothing can remove
// the rows it writes (the app has no delete grant) and other tests would pull them. Rows are
// written already deleted.
const url = process.env.VITE_SUPABASE_URL ?? ''
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ''
const user = { email: 'limits.user@calorithm.test', password: 'Local-Seed-Pass-2026' }

let client: SupabaseClient<Database>
let userId = ''
let foodId = ''
let recipeId = ''

const deleted = () => ({ client_updated_at: new Date().toISOString(), deleted_at: '2000-01-01' })

const food = (overrides: Partial<TablesInsert<'foods'>> = {}): TablesInsert<'foods'> => ({
  id: crypto.randomUUID(),
  user_id: userId,
  name: 'Synthetic limit food',
  serving_size: 100,
  serving_unit: 'g',
  kcal: 100,
  protein_g: 1,
  carbs_g: 1,
  fat_g: 1,
  schema_version: 4,
  ...deleted(),
  ...overrides,
})

// A random far-future day, as the end-to-end tests use, so runs never meet.
const day = () => `2${String(100 + Math.floor(Math.random() * 800))}-01-01`

const entry = (
  overrides: Partial<TablesInsert<'log_entries'>> = {},
): TablesInsert<'log_entries'> => ({
  id: crypto.randomUUID(),
  user_id: userId,
  date: day(),
  meal: 'lunch',
  food_id: foodId,
  recipe_id: null,
  servings: 1,
  name: 'Synthetic limit entry',
  kcal: 1,
  protein_g: 1,
  carbs_g: 1,
  fat_g: 1,
  kcal_per_serving: 1,
  protein_g_per_serving: 1,
  carbs_g_per_serving: 1,
  fat_g_per_serving: 1,
  serving_size: 100,
  serving_unit: 'g',
  logged_at: new Date().toISOString(),
  schema_version: 3,
  ...deleted(),
  ...overrides,
})

// The Postgres error code for an insert, or null when it was stored.
const insertCode = async (
  table: 'foods' | 'log_entries' | 'recipes' | 'recipe_items',
  row: Record<string, unknown>,
): Promise<string | null> => {
  const { error } = await client.from(table).insert(row as never)
  return error ? error.code : null
}

// The limit is accepted, and one step past it fails a CHECK constraint (23514).
const expectLimit = async (
  table: 'foods' | 'log_entries' | 'recipes' | 'recipe_items',
  make: (value: number) => Record<string, unknown>,
  limit: number,
  step: number,
) => {
  expect(await insertCode(table, make(limit))).toBeNull()
  expect(await insertCode(table, make(limit + step))).toBe('23514')
}

beforeAll(async () => {
  expect(url, 'run through npm run test:integration').not.toBe('')
  client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await client.auth.signInWithPassword(user)
  if (error || !data.user) throw new Error(`limits user sign-in failed: ${error?.message}`)
  userId = data.user.id

  const parentFood = food()
  foodId = parentFood.id
  expect(await insertCode('foods', parentFood)).toBeNull()
  recipeId = crypto.randomUUID()
  expect(
    await insertCode('recipes', {
      id: recipeId,
      user_id: userId,
      name: 'Synthetic limit recipe',
      servings: 1,
      schema_version: 1,
      ...deleted(),
    }),
  ).toBeNull()
})

describe('limits match the database', () => {
  it('food serving size, kcal, and grams per serving', async () => {
    const { servingSize, kcal, grams } = limits.food
    await expectLimit('foods', (value) => food({ serving_size: value }), servingSize, 0.01)
    await expectLimit('foods', (value) => food({ kcal: value }), kcal, 1)
    await expectLimit('foods', (value) => food({ protein_g: value }), grams, 0.1)
    await expectLimit('foods', (value) => food({ carbs_g: value }), grams, 0.1)
    await expectLimit('foods', (value) => food({ fat_g: value }), grams, 0.1)
  })

  it('name and unit lengths', async () => {
    const name = (length: number) => food({ name: 'n'.repeat(length) })
    const unit = (length: number) => food({ serving_unit: 'u'.repeat(length) })
    await expectLimit('foods', name, limits.nameLength, 1)
    await expectLimit('foods', unit, limits.unitLength, 1)
  })

  it('servings on log entries, recipes, and recipe items', async () => {
    await expectLimit('log_entries', (value) => entry({ servings: value }), limits.servings, 0.01)
    await expectLimit(
      'recipes',
      (value) => ({
        id: crypto.randomUUID(),
        user_id: userId,
        name: 'Synthetic limit recipe',
        servings: value,
        schema_version: 1,
        ...deleted(),
      }),
      limits.servings,
      0.01,
    )
    await expectLimit(
      'recipe_items',
      (value) => ({
        id: crypto.randomUUID(),
        user_id: userId,
        recipe_id: recipeId,
        food_id: foodId,
        servings: value,
        schema_version: 1,
        ...deleted(),
      }),
      limits.servings,
      0.01,
    )
  })

  it('log entry totals and values per serving', async () => {
    const { kcal, grams } = limits.entry
    await expectLimit('log_entries', (value) => entry({ kcal: value }), kcal, 1)
    await expectLimit('log_entries', (value) => entry({ kcal_per_serving: value }), kcal, 0.001)
    for (const column of ['protein_g', 'carbs_g', 'fat_g'] as const) {
      await expectLimit('log_entries', (value) => entry({ [column]: value }), grams, 0.1)
    }
    for (const column of [
      'protein_g_per_serving',
      'carbs_g_per_serving',
      'fat_g_per_serving',
    ] as const) {
      await expectLimit('log_entries', (value) => entry({ [column]: value }), grams, 0.001)
    }
    await expectLimit(
      'log_entries',
      (value) => entry({ serving_size: value }),
      limits.food.servingSize,
      0.01,
    )
  })

  it('higher-calorie days on the profile', async () => {
    // The profile's id is the user's, so each check updates the one row.
    const profileCode = async (days: number, extra: number): Promise<string | null> => {
      const { error } = await client.from('profile').upsert({
        id: userId,
        user_id: userId,
        higher_kcal_days: days,
        higher_kcal_extra: extra,
        client_updated_at: new Date().toISOString(),
        schema_version: 2,
      })
      return error ? error.code : null
    }
    expect(await profileCode(MAX_HIGHER_DAYS_MASK, 0)).toBeNull()
    expect(await profileCode(MAX_HIGHER_DAYS_MASK + 1, 0)).toBe('23514')
    expect(await profileCode(0, MAX_HIGHER_KCAL_EXTRA)).toBeNull()
    expect(await profileCode(0, MAX_HIGHER_KCAL_EXTRA + 1)).toBe('23514')
  })
})
