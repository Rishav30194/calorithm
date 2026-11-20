import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { LocalDb } from './db'
import { readProfile, setUnits } from './profile'

const userId = 'a0000000-0000-4000-8000-000000000001'
let db: LocalDb
const clock = () => new Date('2026-11-20T10:00:00.000Z')

beforeEach(() => {
  db = new LocalDb('calorithm-test-profile')
})

afterEach(async () => {
  db.close()
  await Dexie.delete('calorithm-test-profile')
})

describe('setUnits', () => {
  it('creates the profile with defaults when there is none yet', async () => {
    await setUnits(db, userId, 'imperial', clock)

    expect(await readProfile(db, userId)).toMatchObject({
      id: userId,
      user_id: userId,
      units: 'imperial',
      protein_g_per_kg: 1.8,
      calorie_floor_kcal: 1200,
      deleted_at: null,
    })
    expect(await db.outbox.count()).toBe(1)
  })

  it('changes only the units of an existing profile', async () => {
    await setUnits(db, userId, 'imperial', clock)
    const before = await readProfile(db, userId)
    await db.table('profile').put({ ...before, height_cm: 180 })

    await setUnits(db, userId, 'metric', clock)

    expect(await readProfile(db, userId)).toMatchObject({ units: 'metric', height_cm: 180 })
    expect(await db.outbox.count()).toBe(1)
  })
})

describe('readProfile', () => {
  it('is null when there is no profile', async () => {
    expect(await readProfile(db, userId)).toBeNull()
  })
})
