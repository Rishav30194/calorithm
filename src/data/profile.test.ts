import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { LocalDb } from './db'
import { readProfile, setUnits } from './profile'
import type { SyncContext } from './sync/push'
import { FakeRemote } from './sync/testing/fakeRemote'
import { closeAll, openDb, sync, userId } from './sync/testing/fixtures'
import { type ProfileRow, profileSpec } from './tables'

let db: LocalDb
let remote: FakeRemote
let ctx: SyncContext
const clock = () => new Date('2026-11-20T10:00:00.000Z')

const serverProfile = (overrides: Partial<ProfileRow> = {}): ProfileRow => ({
  ...sync({ id: userId, client_updated_at: '2026-11-19T10:00:00.000Z' }),
  height_cm: 180,
  birth_date: '1990-01-01',
  sex: 'male',
  activity_level: 'moderate',
  units: 'metric',
  goal_rate_kg_per_week: -0.5,
  protein_g_per_kg: 2,
  calorie_floor_kcal: 1500,
  ...overrides,
})

beforeEach(() => {
  db = openDb('calorithm-test-profile')
  remote = new FakeRemote(userId)
  ctx = { db, remote, tables: [profileSpec], clock, random: () => 0 }
})

afterEach(closeAll)

describe('setUnits', () => {
  it('keeps every other field the server has when this device has no profile yet', async () => {
    await remote.upsert('profile', [serverProfile()])

    expect(await setUnits(ctx, userId, 'imperial')).toEqual({ ok: true })

    expect(await readProfile(db, userId)).toMatchObject({
      units: 'imperial',
      height_cm: 180,
      goal_rate_kg_per_week: -0.5,
      calorie_floor_kcal: 1500,
    })
  })

  it('refuses while offline when this device has no profile yet', async () => {
    remote.offline = true

    expect(await setUnits(ctx, userId, 'imperial')).toEqual({ ok: false, reason: 'offline' })

    expect(await readProfile(db, userId)).toBeNull()
    expect(await db.outbox.count()).toBe(0)
  })

  it('creates the profile with defaults when the server has none either', async () => {
    expect(await setUnits(ctx, userId, 'imperial')).toEqual({ ok: true })

    expect(await readProfile(db, userId)).toMatchObject({
      id: userId,
      units: 'imperial',
      height_cm: null,
      protein_g_per_kg: 1.8,
      calorie_floor_kcal: 1200,
    })
    expect(await db.outbox.count()).toBe(1)
  })

  it('changes only the units of the local profile, without asking the server', async () => {
    await setUnits(ctx, userId, 'imperial')
    const before = await readProfile(db, userId)
    await db.table('profile').put({ ...before, height_cm: 175 })
    remote.offline = true

    expect(await setUnits(ctx, userId, 'metric')).toEqual({ ok: true })

    expect(await readProfile(db, userId)).toMatchObject({ units: 'metric', height_cm: 175 })
  })
})

describe('readProfile', () => {
  it('is null when there is no profile', async () => {
    expect(await readProfile(db, userId)).toBeNull()
  })
})
