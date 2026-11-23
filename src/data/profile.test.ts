import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ProfileSettings } from '@/domain/profile'
import type { LocalDb } from './db'

import { loadProfile, profileSettings, readProfile, saveProfileSettings, setUnits } from './profile'
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
  higher_kcal_days: null,
  higher_kcal_extra: null,
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

describe('profileSettings', () => {
  it('gives the column defaults when there is no profile', () => {
    expect(profileSettings(null)).toEqual({
      heightCm: null,
      birthDate: null,
      sex: null,
      activityLevel: null,
      goalRateKgPerWeek: 0,
      proteinGPerKg: 1.8,
      calorieFloorKcal: 1200,
    })
  })

  it('reads the stored fields', () => {
    expect(profileSettings(serverProfile())).toEqual({
      heightCm: 180,
      birthDate: '1990-01-01',
      sex: 'male',
      activityLevel: 'moderate',
      goalRateKgPerWeek: -0.5,
      proteinGPerKg: 2,
      calorieFloorKcal: 1500,
    })
  })

  it('treats a sex or activity level this version doesn’t know as not set', () => {
    expect(
      profileSettings(serverProfile({ sex: 'other', activity_level: 'extreme' })),
    ).toMatchObject({
      sex: null,
      activityLevel: null,
    })
  })
})

describe('saveProfileSettings', () => {
  const today = '2026-11-20'
  const settings: ProfileSettings = {
    heightCm: 165.5,
    birthDate: '1985-03-10',
    sex: 'female',
    activityLevel: 'light',
    goalRateKgPerWeek: -0.25,
    proteinGPerKg: 1.6,
    calorieFloorKcal: 1300,
  }

  it('writes every setting and keeps the units, through the outbox', async () => {
    await remote.upsert('profile', [serverProfile({ units: 'imperial' })])

    expect(await saveProfileSettings(ctx, userId, settings, today)).toEqual({ ok: true })

    expect(await readProfile(db, userId)).toMatchObject({
      units: 'imperial',
      height_cm: 165.5,
      birth_date: '1985-03-10',
      sex: 'female',
      activity_level: 'light',
      goal_rate_kg_per_week: -0.25,
      protein_g_per_kg: 1.6,
      calorie_floor_kcal: 1300,
      client_updated_at: clock().toISOString(),
    })
    expect(await db.outbox.count()).toBe(1)
  })

  it('clears body fields set to empty', async () => {
    await remote.upsert('profile', [serverProfile()])
    const empty = { ...settings, heightCm: null, birthDate: null, sex: null, activityLevel: null }

    expect(await saveProfileSettings(ctx, userId, empty, today)).toEqual({ ok: true })

    expect(await readProfile(db, userId)).toMatchObject({
      height_cm: null,
      birth_date: null,
      sex: null,
      activity_level: null,
    })
  })

  it('writes only the fields given, keeping the rest as stored', async () => {
    await remote.upsert('profile', [
      serverProfile({ height_cm: 180, activity_level: 'athlete', goal_rate_kg_per_week: -0.27 }),
    ])

    expect(await saveProfileSettings(ctx, userId, { calorieFloorKcal: 1600 }, today)).toEqual({
      ok: true,
    })

    // A value this version doesn't know, and a rate pounds can't show exactly, survive.
    expect(await readProfile(db, userId)).toMatchObject({
      height_cm: 180,
      activity_level: 'athlete',
      goal_rate_kg_per_week: -0.27,
      calorie_floor_kcal: 1600,
    })
  })

  it('keeps a change another device synced in, when saving a different field', async () => {
    await remote.upsert('profile', [serverProfile()])
    await saveProfileSettings(ctx, userId, { heightCm: 175 }, today)
    await db.table('profile').put({
      ...(await readProfile(db, userId)),
      calorie_floor_kcal: 1800,
    })

    await saveProfileSettings(ctx, userId, { heightCm: 176 }, today)

    expect(await readProfile(db, userId)).toMatchObject({
      height_cm: 176,
      calorie_floor_kcal: 1800,
    })
  })

  it('refuses settings the database would reject, and writes nothing', async () => {
    const result = await saveProfileSettings(
      ctx,
      userId,
      { ...settings, calorieFloorKcal: 900 },
      today,
    )

    expect(result).toEqual({ ok: false, reason: 'invalid', fields: ['calorieFloorKcal'] })
    expect(await readProfile(db, userId)).toBeNull()
    expect(await db.outbox.count()).toBe(0)
  })

  it('refuses while offline when this device has no profile yet', async () => {
    remote.offline = true

    expect(await saveProfileSettings(ctx, userId, settings, today)).toEqual({
      ok: false,
      reason: 'offline',
    })
    expect(await db.outbox.count()).toBe(0)
  })
})

describe('loadProfile', () => {
  it('fetches and stores the server’s profile when this device has none', async () => {
    await remote.upsert('profile', [serverProfile()])

    expect(await loadProfile(ctx, userId)).toMatchObject({
      ok: true,
      row: { height_cm: 180, calorie_floor_kcal: 1500 },
    })

    expect(await readProfile(db, userId)).toMatchObject({
      height_cm: 180,
      calorie_floor_kcal: 1500,
    })
    expect(await db.outbox.count()).toBe(0)
  })

  it('succeeds without writing when the server has no profile either', async () => {
    expect(await loadProfile(ctx, userId)).toEqual({ ok: true, row: null })
    expect(await readProfile(db, userId)).toBeNull()
  })

  it('uses the local profile without asking the server', async () => {
    await db.table('profile').put(serverProfile({ height_cm: 170 }))
    remote.offline = true

    expect(await loadProfile(ctx, userId)).toMatchObject({ ok: true, row: { height_cm: 170 } })
  })

  it('reports offline when it can’t reach the server for a missing profile', async () => {
    remote.offline = true
    expect(await loadProfile(ctx, userId)).toEqual({ ok: false, reason: 'offline' })
  })
})
