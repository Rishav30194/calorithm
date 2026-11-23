import type { CheckinFields } from '@/domain/checkin'

import { saveCheckin } from '../checkins'
import type { LocalDb } from '../db'
import { createFood, createRecipe, setFoodArchived } from '../foods'
import { logFood, logRecipe, removeEntry, setDayComplete } from '../log'
import { type Clock, writeRow } from '../repository'
import { profileSpec } from '../tables'
import { setWeighIn } from '../weights'

export const checkinFields: CheckinFields = {
  date: '2026-11-20',
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

// Synthetic data with a live row in every table, an archived food, and a removed log entry.
export const seedSample = async (db: LocalDb, clock: Clock, userId: string): Promise<void> => {
  await writeRow(
    db,
    profileSpec,
    {
      id: userId,
      user_id: userId,
      height_cm: 180,
      birth_date: '1990-05-01',
      sex: 'male',
      activity_level: 'moderate',
      units: 'metric',
      goal_rate_kg_per_week: -0.5,
      protein_g_per_kg: 1.8,
      calorie_floor_kcal: 1200,
      higher_kcal_days: null,
      higher_kcal_extra: null,
      updated_at: '',
      client_updated_at: '',
      deleted_at: null,
      schema_version: 1,
    },
    clock,
  )
  const oats = await createFood(db, clock, userId, {
    name: 'Oats',
    servingSize: 40,
    servingUnit: 'g',
    kcal: 150,
    proteinG: 5,
    carbsG: 20,
    fatG: 3,
  })
  const milk = await createFood(db, clock, userId, {
    name: 'Milk',
    servingSize: 250,
    servingUnit: 'ml',
    kcal: 120,
    proteinG: 8.5,
    carbsG: 20,
    fatG: 3,
  })
  const bar = await createFood(db, clock, userId, {
    name: 'Old bar',
    servingSize: 1,
    servingUnit: 'bar',
    kcal: 200,
    proteinG: 10,
    carbsG: 20,
    fatG: 3,
  })
  await setFoodArchived(db, clock, bar.id, true)
  const porridge = await createRecipe(db, clock, userId, {
    name: 'Porridge',
    servings: 2,
    items: [
      { foodId: oats.id, servings: 2 },
      { foodId: milk.id, servings: 1 },
    ],
  })
  await logFood(db, clock, userId, {
    date: '2026-11-19',
    meal: 'breakfast',
    food: oats,
    servings: 1.5,
  })
  await logRecipe(db, clock, userId, {
    date: '2026-11-20',
    meal: 'lunch',
    recipe: porridge,
    servings: 1,
  })
  const removed = await logFood(db, clock, userId, {
    date: '2026-11-20',
    meal: 'dinner',
    food: milk,
    servings: 1,
  })
  await removeEntry(db, clock, removed.id)
  await setDayComplete(db, clock, userId, '2026-11-19', true)
  await setWeighIn(db, clock, userId, { date: '2026-11-19', kg: 82.4 })
  await setWeighIn(db, clock, userId, { date: '2026-11-20', kg: 82.1 })
  await saveCheckin(db, clock, userId, checkinFields)
}
