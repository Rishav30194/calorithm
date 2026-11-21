import { daysBetween } from './dates'
import { type Body, type DayIntake, estimateMaintenance } from './maintenance'
import { targets } from './targets'
import type { WeighIn } from './trend'

const CHECKIN_INTERVAL_DAYS = 7

// Due with no check-in yet, or 7 days after the last one; a longer gap gives one check-in,
// not one per missed week (decision 0021).
export const isCheckinDue = (lastDate: string | null, today: string): boolean =>
  lastDate === null || daysBetween(lastDate, today) >= CHECKIN_INTERVAL_DAYS

export type Settings = {
  goalRateKgPerWeek: number
  proteinGPerKg: number
  calorieFloorKcal: number
}

// What a skipped week copies from the check-in before it.
export type PreviousCheckin = {
  date: string
  maintenanceKcal: number
  kcalTarget: number
  proteinTargetG: number
  trendWeightKg: number
  goalRateRequestedKgPerWeek: number
  goalRateAppliedKgPerWeek: number
  proteinGPerKg: number
  calorieFloorKcal: number
  floorApplied: boolean
  rateCapped: boolean
}

export type CheckinInput = {
  today: string
  weighIns: readonly WeighIn[]
  days: readonly DayIntake[]
  previous: PreviousCheckin | null
  body: Body
  settings: Settings
}

// One check-in's stored values: the checkins table's columns, apart from the sync columns.
export type CheckinFields = PreviousCheckin & {
  status: 'updated' | 'skipped'
  skipReason: 'too_few_complete_days' | null
  method: 'formula' | 'adaptive' | null
  previousMaintenanceKcal: number | null
  rawMaintenanceKcal: number | null
  trendChangeKg: number | null
  windowDays: number | null
  completeDaysInWindow: number | null
  averageIntakeKcal: number | null
  completeDaysInWeek: number
}

export type CheckinOutcome =
  | { kind: 'blocked'; reason: 'no_weigh_ins' | 'profile_incomplete' }
  | { kind: 'ready'; checkin: CheckinFields }

export const toPrevious = (checkin: CheckinFields): PreviousCheckin => ({
  date: checkin.date,
  maintenanceKcal: checkin.maintenanceKcal,
  kcalTarget: checkin.kcalTarget,
  proteinTargetG: checkin.proteinTargetG,
  trendWeightKg: checkin.trendWeightKg,
  goalRateRequestedKgPerWeek: checkin.goalRateRequestedKgPerWeek,
  goalRateAppliedKgPerWeek: checkin.goalRateAppliedKgPerWeek,
  proteinGPerKg: checkin.proteinGPerKg,
  calorieFloorKcal: checkin.calorieFloorKcal,
  floorApplied: checkin.floorApplied,
  rateCapped: checkin.rateCapped,
})

// The check-in for `today`: the new estimate and targets, or the previous ones carried through
// a skipped week. Nothing is stored here; the caller saves the result when the user confirms.
export const runCheckin = (input: CheckinInput): CheckinOutcome => {
  const { today, previous, settings } = input
  const estimate = estimateMaintenance({
    today,
    weighIns: input.weighIns,
    days: input.days,
    previousKcal: previous?.maintenanceKcal ?? null,
    body: input.body,
  })

  switch (estimate.kind) {
    case 'blocked':
      return estimate
    case 'skipped':
      // estimateMaintenance skips only when there's a previous estimate.
      if (previous === null) throw new Error('skipped check-in without a previous one')
      return {
        kind: 'ready',
        checkin: {
          ...previous,
          date: today,
          status: 'skipped',
          skipReason: estimate.reason,
          method: null,
          previousMaintenanceKcal: previous.maintenanceKcal,
          rawMaintenanceKcal: null,
          trendChangeKg: null,
          windowDays: null,
          completeDaysInWindow: null,
          averageIntakeKcal: null,
          completeDaysInWeek: estimate.completeDaysInWeek,
        },
      }
    case 'updated': {
      const result = targets({
        maintenanceKcal: estimate.maintenanceKcal,
        goalRateKgPerWeek: settings.goalRateKgPerWeek,
        trendWeightKg: estimate.trendWeightKg,
        proteinGPerKg: settings.proteinGPerKg,
        calorieFloorKcal: settings.calorieFloorKcal,
      })
      const { window } = estimate
      return {
        kind: 'ready',
        checkin: {
          date: today,
          status: 'updated',
          skipReason: null,
          method: estimate.method,
          previousMaintenanceKcal: previous?.maintenanceKcal ?? null,
          rawMaintenanceKcal: estimate.rawKcal,
          maintenanceKcal: estimate.maintenanceKcal,
          kcalTarget: result.kcal,
          proteinTargetG: result.proteinG,
          trendWeightKg: estimate.trendWeightKg,
          trendChangeKg: window?.trendChangeKg ?? null,
          windowDays: window?.days ?? null,
          completeDaysInWindow: window?.completeDays ?? null,
          averageIntakeKcal: window?.averageIntakeKcal ?? null,
          completeDaysInWeek: estimate.completeDaysInWeek,
          goalRateRequestedKgPerWeek: settings.goalRateKgPerWeek,
          goalRateAppliedKgPerWeek: result.appliedRateKgPerWeek,
          proteinGPerKg: settings.proteinGPerKg,
          calorieFloorKcal: settings.calorieFloorKcal,
          floorApplied: result.floorApplied,
          rateCapped: result.rateCapped,
        },
      }
    }
  }
}
