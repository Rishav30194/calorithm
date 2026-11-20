import { describe, expect, expectTypeOf, it } from 'vitest'

import type { Tables } from './database.types'
import { type ProfileRow, profileSpec, syncedTables } from './tables'

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

describe('syncedTables', () => {
  it('lists each table once, in push order', () => {
    const names = syncedTables.map((spec) => spec.name)
    expect(names).toEqual(['profile'])
    expect(new Set(names).size).toBe(names.length)
  })
})
