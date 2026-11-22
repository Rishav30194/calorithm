import fc from 'fast-check'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { type CheckinFields, runCheckin } from '@/domain/checkin'
import { addDays } from '@/domain/dates'
import { activityLevels, type DayIntake } from '@/domain/maintenance'
import type { WeighIn } from '@/domain/trend'

import { checkinRow, checkinState, fieldsFromRow, latestCheckin, saveCheckin } from './checkins'
import { checkinId } from './dayId'
import type { LocalDb } from './db'
import { logFood, setDayComplete } from './log'
import { saveProfileSettings } from './profile'
import type { SyncContext } from './sync/push'
import { FakeRemote } from './sync/testing/fakeRemote'
import { closeAll, manualClock, openDb, userId } from './sync/testing/fixtures'
import { checkinsSpec, type FoodRow, profileSpec } from './tables'
import { setWeighIn } from './weights'

let db: LocalDb
let time: ReturnType<typeof manualClock>

beforeEach(() => {
  db = openDb('calorithm-test-checkins')
  time = manualClock()
})

afterEach(closeAll)

const today = '2026-11-21'

const fields: CheckinFields = {
  date: today,
  status: 'updated',
  skipReason: null,
  method: 'adaptive',
  previousMaintenanceKcal: 2500,
  rawMaintenanceKcal: 2400,
  maintenanceKcal: 2450,
  kcalTarget: 1900,
  proteinTargetG: 147.6,
  trendWeightKg: 82,
  trendChangeKg: -1.2,
  windowDays: 28,
  completeDaysInWindow: 24,
  averageIntakeKcal: 2120,
  completeDaysInWeek: 6,
  goalRateRequestedKgPerWeek: -0.5,
  goalRateAppliedKgPerWeek: -0.5,
  proteinGPerKg: 1.8,
  calorieFloorKcal: 1200,
  floorApplied: false,
  rateCapped: false,
}

const food: FoodRow = {
  id: 'f0000000-0000-4000-8000-000000000001',
  user_id: userId,
  name: 'Oats',
  serving_size: 40,
  serving_unit: 'g',
  kcal: 1100,
  protein_g: 5,
  carbs_g: null,
  fat_g: null,
  catalog_id: null,
  archived_at: null,
  updated_at: '',
  client_updated_at: '',
  deleted_at: null,
  schema_version: 1,
}

describe('checkinRow and fieldsFromRow', () => {
  it('map the fields to the stored row and back', async () => {
    const row = await checkinRow(userId, fields)
    expect(row).toMatchObject({
      id: await checkinId(userId, today),
      user_id: userId,
      date: today,
      maintenance_kcal: 2450,
      kcal_target: 1900,
      trend_change_kg: -1.2,
      floor_applied: false,
    })
    expect(fieldsFromRow(row)).toEqual(fields)
  })

  it('give rows the checkins table accepts, for any check-in the calculation makes', async () => {
    const weighInsArb = fc
      .array(
        fc.record({
          offset: fc.integer({ min: 0, max: 60 }),
          kg: fc.integer({ min: 2000, max: 40000 }).map((h) => h / 100),
        }),
        { minLength: 1, maxLength: 20 },
      )
      .map((items): WeighIn[] =>
        items.map(({ offset, kg }) => ({ date: addDays(today, -offset), kg })),
      )
    const daysArb = fc
      .array(fc.record({ kcal: fc.integer({ min: 0, max: 8000 }), complete: fc.boolean() }), {
        minLength: 35,
        maxLength: 35,
      })
      .map((items): DayIntake[] =>
        items.map((item, i) => ({ date: addDays(today, i - 35), ...item })),
      )
    await fc.assert(
      fc.asyncProperty(
        weighInsArb,
        daysArb,
        fc.integer({ min: -200, max: 200 }),
        fc.constantFrom(...activityLevels),
        fc.boolean(),
        async (weighIns, days, rateHundredths, activityLevel, withPrevious) => {
          const run = (previous: Parameters<typeof runCheckin>[0]['previous']) =>
            runCheckin({
              today,
              weighIns,
              days,
              previous,
              body: { heightCm: 170, birthDate: '1990-01-01', sex: 'female', activityLevel },
              settings: {
                goalRateKgPerWeek: rateHundredths / 100,
                proteinGPerKg: 1.8,
                calorieFloorKcal: 1200,
              },
            })
          const first = run(null)
          if (first.kind !== 'ready') return
          const outcome = withPrevious ? run({ ...first.checkin, date: addDays(today, -7) }) : first
          if (outcome.kind !== 'ready') return
          const row = await checkinRow(userId, outcome.checkin)
          expect(checkinsSpec.parse(row)).not.toBeNull()
        },
      ),
      { numRuns: 200 },
    )
  })
})

describe('saveCheckin and latestCheckin', () => {
  it('stores the check-in through the outbox and reads back the latest', async () => {
    expect(await latestCheckin(db)).toBeNull()
    await saveCheckin(db, time.clock, userId, { ...fields, date: '2026-11-14' })
    await saveCheckin(db, time.clock, userId, fields)

    expect(await latestCheckin(db)).toEqual(fields)
    expect(await db.outbox.where('table').equals('checkins').count()).toBe(2)
  })
})

describe('latestCheckin with an unreadable row', () => {
  it('skips a row this version can’t read, and returns the newest it can', async () => {
    await saveCheckin(db, time.clock, userId, { ...fields, date: '2026-11-14' })
    const newer = await checkinRow(userId, fields)
    await db.table('checkins').put({ ...newer, status: 'paused' })

    expect(await latestCheckin(db)).toMatchObject({ date: '2026-11-14' })
  })
})

describe('checkinState', () => {
  const ctx = (): SyncContext => ({
    db,
    remote: new FakeRemote(userId),
    tables: [profileSpec],
    clock: time.clock,
    random: () => 0,
  })

  it('is due and ready on a first check-in, from the stored weigh-ins, log, and profile', async () => {
    await saveProfileSettings(
      ctx(),
      userId,
      {
        heightCm: 180,
        birthDate: '1996-06-01',
        sex: 'male',
        activityLevel: 'moderate',
        goalRateKgPerWeek: -0.5,
      },
      today,
    )
    await setWeighIn(db, time.clock, userId, { date: '2026-09-01', kg: 80 })
    for (let i = 1; i <= 28; i++) {
      const date = addDays(today, -i)
      await logFood(db, time.clock, userId, { date, meal: 'lunch', food, servings: 2 })
      await setDayComplete(db, time.clock, userId, date, true)
    }
    // An incomplete day with a huge intake changes nothing.
    await logFood(db, time.clock, userId, {
      date: addDays(today, -29),
      meal: 'lunch',
      food,
      servings: 9,
    })

    const state = await checkinState(db, userId, today)

    expect(state).toMatchObject({
      latest: null,
      due: true,
      unit: 'kg',
      outcome: {
        kind: 'ready',
        checkin: {
          method: 'adaptive',
          rawMaintenanceKcal: 2200,
          kcalTarget: 1650,
          completeDaysInWeek: 7,
        },
      },
    })
  })

  it('isn’t due within 7 days of the last check-in, and gives no outcome', async () => {
    await saveCheckin(db, time.clock, userId, { ...fields, date: '2026-11-16' })
    expect(await checkinState(db, userId, today)).toMatchObject({
      latest: { date: '2026-11-16' },
      due: false,
      outcome: null,
    })
  })

  it('passes the previous check-in on, so a short week is skipped', async () => {
    await saveCheckin(db, time.clock, userId, { ...fields, date: '2026-11-14' })
    await setWeighIn(db, time.clock, userId, { date: '2026-09-01', kg: 80 })
    expect(await checkinState(db, userId, today)).toMatchObject({
      due: true,
      outcome: {
        kind: 'ready',
        checkin: { status: 'skipped', kcalTarget: 1900, completeDaysInWeek: 0 },
      },
    })
  })

  it('is blocked without a weigh-in', async () => {
    expect(await checkinState(db, userId, today)).toMatchObject({
      due: true,
      outcome: { kind: 'blocked', reason: 'no_weigh_ins' },
    })
  })
})
