import type { WeekPlan } from '@/domain/calorieDays'
import {
  type CheckinFields,
  type CheckinOutcome,
  isCheckinDue,
  runCheckin,
  toPrevious,
} from '@/domain/checkin'
import { addDays } from '@/domain/dates'
import type { DayIntake } from '@/domain/maintenance'
import { sumNutrients } from '@/domain/nutrition'
import type { WeightUnit } from '@/domain/weight'

import { checkinId } from './dayId'
import type { LocalDb } from './db'
import { entriesBetween } from './log'
import { profileSettings, readProfile } from './profile'
import { type Clock, visibleRows, writeRow } from './repository'
import { type CheckinRow, checkinsSpec, daysSpec } from './tables'
import { weighIns } from './weights'

// The adaptive window reads at most 28 days before yesterday, and the week check 7.
const INTAKE_DAYS = 35

export const checkinRow = async (userId: string, fields: CheckinFields): Promise<CheckinRow> => ({
  id: await checkinId(userId, fields.date),
  user_id: userId,
  date: fields.date,
  status: fields.status,
  skip_reason: fields.skipReason,
  method: fields.method,
  previous_maintenance_kcal: fields.previousMaintenanceKcal,
  raw_maintenance_kcal: fields.rawMaintenanceKcal,
  maintenance_kcal: fields.maintenanceKcal,
  kcal_target: fields.kcalTarget,
  protein_target_g: fields.proteinTargetG,
  trend_weight_kg: fields.trendWeightKg,
  trend_change_kg: fields.trendChangeKg,
  window_days: fields.windowDays,
  complete_days_in_window: fields.completeDaysInWindow,
  average_intake_kcal: fields.averageIntakeKcal,
  complete_days_in_week: fields.completeDaysInWeek,
  goal_rate_requested_kg_per_week: fields.goalRateRequestedKgPerWeek,
  goal_rate_applied_kg_per_week: fields.goalRateAppliedKgPerWeek,
  protein_g_per_kg: fields.proteinGPerKg,
  calorie_floor_kcal: fields.calorieFloorKcal,
  floor_applied: fields.floorApplied,
  rate_capped: fields.rateCapped,
  updated_at: '',
  client_updated_at: '',
  deleted_at: null,
  schema_version: checkinsSpec.schemaVersion,
})

const isStatus = (value: string): value is CheckinFields['status'] =>
  value === 'updated' || value === 'skipped'

const isMethod = (value: string | null): value is CheckinFields['method'] =>
  value === null || value === 'formula' || value === 'adaptive'

const isSkipReason = (value: string | null): value is CheckinFields['skipReason'] =>
  value === null || value === 'too_few_complete_days'

// Null for a row whose status, method, or reason this version doesn't know. checkinsSpec
// already refuses those, so only a row that skipped the spec could reach this.
export const fieldsFromRow = (row: CheckinRow): CheckinFields | null => {
  const { status, method, skip_reason: skipReason } = row
  if (!isStatus(status) || !isMethod(method) || !isSkipReason(skipReason)) return null
  return {
    date: row.date,
    status,
    skipReason,
    method,
    previousMaintenanceKcal: row.previous_maintenance_kcal,
    rawMaintenanceKcal: row.raw_maintenance_kcal,
    maintenanceKcal: row.maintenance_kcal,
    kcalTarget: row.kcal_target,
    proteinTargetG: row.protein_target_g,
    trendWeightKg: row.trend_weight_kg,
    trendChangeKg: row.trend_change_kg,
    windowDays: row.window_days,
    completeDaysInWindow: row.complete_days_in_window,
    averageIntakeKcal: row.average_intake_kcal,
    completeDaysInWeek: row.complete_days_in_week,
    goalRateRequestedKgPerWeek: row.goal_rate_requested_kg_per_week,
    goalRateAppliedKgPerWeek: row.goal_rate_applied_kg_per_week,
    proteinGPerKg: row.protein_g_per_kg,
    calorieFloorKcal: row.calorie_floor_kcal,
    floorApplied: row.floor_applied,
    rateCapped: row.rate_capped,
  }
}

// The newest check-in this version can read; an unreadable row never hides older ones.
export const latestCheckin = async (db: LocalDb): Promise<CheckinFields | null> => {
  const readable = (await visibleRows(db, checkinsSpec)).flatMap((row) => {
    const fields = fieldsFromRow(row)
    return fields ? [fields] : []
  })
  return readable.sort((a, b) => b.date.localeCompare(a.date))[0] ?? null
}

// What each day's targets are worked out from (decision 0033): the latest check-in's targets
// and the floor it used, and the profile's higher-calorie days. Null before the first
// check-in.
export const weekPlan = async (db: LocalDb, userId: string): Promise<WeekPlan | null> => {
  const [latest, profile] = await Promise.all([latestCheckin(db), readProfile(db, userId)])
  if (!latest) return null
  return {
    kcalTarget: latest.kcalTarget,
    proteinTargetG: latest.proteinTargetG,
    floorKcal: latest.calorieFloorKcal,
    calorieDays: profileSettings(profile).calorieDays ?? { days: 0, extraKcal: 0 },
  }
}

// Stored when the user saves the check-in screen. A second save the same day, from any device,
// writes the same row.
export const saveCheckin = async (
  db: LocalDb,
  clock: Clock,
  userId: string,
  fields: CheckinFields,
): Promise<void> => {
  await writeRow(db, checkinsSpec, await checkinRow(userId, fields), clock)
}

// Each day's logged kcal and whether it's marked complete, for the days before today.
const intakeDays = async (db: LocalDb, today: string): Promise<DayIntake[]> => {
  const first = addDays(today, -INTAKE_DAYS)
  const last = addDays(today, -1)
  const entries = await entriesBetween(db, first, last)
  const complete = new Map<string, boolean>()
  for (const raw of await db
    .rows('days')
    .where('date')
    .between(first, last, true, true)
    .toArray()) {
    const day = daysSpec.parse(raw)
    if (day && day.deleted_at === null) complete.set(day.date, day.complete)
  }
  const dates = new Set([...complete.keys(), ...entries.map((entry) => entry.date)])
  return [...dates].sort().map((date) => ({
    date,
    kcal: sumNutrients(entries.filter((entry) => entry.date === date)).kcal,
    complete: complete.get(date) ?? false,
  }))
}

export type CheckinState = {
  latest: CheckinFields | null
  due: boolean
  unit: WeightUnit
  // The check-in to save, or why it can't run; null when none is due.
  outcome: CheckinOutcome | null
}

export const checkinState = async (
  db: LocalDb,
  userId: string,
  today: string,
): Promise<CheckinState> => {
  const [latest, profile] = await Promise.all([latestCheckin(db), readProfile(db, userId)])
  const unit = profile?.units === 'imperial' ? 'lb' : 'kg'
  const due = isCheckinDue(latest?.date ?? null, today)
  if (!due) return { latest, due, unit, outcome: null }

  const settings = profileSettings(profile)
  const outcome = runCheckin({
    today,
    weighIns: await weighIns(db),
    days: await intakeDays(db, today),
    previous: latest ? toPrevious(latest) : null,
    body: {
      heightCm: settings.heightCm,
      birthDate: settings.birthDate,
      sex: settings.sex,
      activityLevel: settings.activityLevel,
    },
    settings: {
      goalRateKgPerWeek: settings.goalRateKgPerWeek,
      proteinGPerKg: settings.proteinGPerKg,
      calorieFloorKcal: settings.calorieFloorKcal,
    },
  })
  return { latest, due, unit, outcome }
}
