import { addDays, daysBetween } from './dates'
import { roundTo } from './nutrition'
import { KCAL_PER_KG } from './targets'
import { type TrendPoint, trend, type WeighIn } from './trend'

export type Sex = 'female' | 'male'

export const activityLevels = ['sedentary', 'light', 'moderate', 'active', 'very_active'] as const

export type ActivityLevel = (typeof activityLevels)[number]

// The usual multipliers for the Mifflin-St Jeor resting estimate.
const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
}

// The profile fields the formula needs; any can be missing until the user fills them in.
export type Body = {
  heightCm: number | null
  birthDate: string | null
  sex: Sex | null
  activityLevel: ActivityLevel | null
}

// One logged day: its total intake, and whether the user marked everything eaten as logged.
export type DayIntake = { date: string; kcal: number; complete: boolean }

export type MaintenanceInput = {
  today: string
  weighIns: readonly WeighIn[]
  days: readonly DayIntake[]
  previousKcal: number | null
  body: Body
}

export type Window = {
  days: number
  completeDays: number
  averageIntakeKcal: number
  trendChangeKg: number
}

export type MaintenanceResult =
  | { kind: 'blocked'; reason: 'no_weigh_ins' | 'profile_incomplete' }
  | {
      kind: 'skipped'
      reason: 'too_few_complete_days'
      completeDaysInWeek: number
      trendWeightKg: number
    }
  | {
      kind: 'updated'
      method: 'formula' | 'adaptive'
      rawKcal: number
      maintenanceKcal: number
      trendWeightKg: number
      completeDaysInWeek: number
      // Null for the formula, which uses no intake.
      window: Window | null
    }

// Rules from decision 0021.
const WINDOW_MAX_DAYS = 28
const WINDOW_MIN_DAYS = 14
const WEEK_DAYS = 7
const MIN_COMPLETE_DAYS_IN_WEEK = 4
const BLEND = 0.5
const MAX_STEP_KCAL = 150

// The ranges the checkins table allows. Clamping keeps every check-in pushable.
const MAINTENANCE_MAX_KCAL = 20000
const RAW_LIMIT_KCAL = 100000
const AVERAGE_INTAKE_MAX_KCAL = 100000

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

// Whole years from the birth date to `today`. Someone born on 29 February turns a year older
// on 1 March in non-leap years.
export const ageOn = (birthDate: string, today: string): number => {
  const [birthYear = 0] = birthDate.split('-').map(Number)
  const [year = 0] = today.split('-').map(Number)
  const birthdayPassed = today.slice(5) >= birthDate.slice(5)
  return year - birthYear - (birthdayPassed ? 0 : 1)
}

export type FormulaInput = {
  weightKg: number
  heightCm: number
  ageYears: number
  sex: Sex
  activityLevel: ActivityLevel
}

// Mifflin-St Jeor resting energy times an activity factor, unrounded.
export const formulaMaintenance = (input: FormulaInput): number => {
  const sexTerm = input.sex === 'male' ? 5 : -161
  const resting = 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.ageYears + sexTerm
  return resting * ACTIVITY_FACTORS[input.activityLevel]
}

const formulaRaw = (body: Body, weightKg: number, today: string): number | null => {
  const { heightCm, birthDate, sex, activityLevel } = body
  if (heightCm === null || birthDate === null || sex === null || activityLevel === null) return null
  const kcal = formulaMaintenance({
    weightKg,
    heightCm,
    ageYears: ageOn(birthDate, today),
    sex,
    activityLevel,
  })
  return clamp(Math.round(kcal), 0, MAINTENANCE_MAX_KCAL)
}

const trendOn = (points: readonly TrendPoint[], date: string): number | null =>
  points.find((point) => point.date === date)?.trendKg ?? null

// The new estimate moves halfway toward the raw one, by at most 150 kcal.
const blend = (previousKcal: number | null, rawKcal: number): number => {
  if (previousKcal === null) return clamp(rawKcal, 0, MAINTENANCE_MAX_KCAL)
  const step = clamp((rawKcal - previousKcal) * BLEND, -MAX_STEP_KCAL, MAX_STEP_KCAL)
  return clamp(Math.round(previousKcal + step), 0, MAINTENANCE_MAX_KCAL)
}

// The maintenance estimate for a check-in on `today` (decision 0021). Intake comes from
// complete days up to yesterday, since today's log isn't finished; the trend weight includes
// today's weigh-in.
export const estimateMaintenance = (input: MaintenanceInput): MaintenanceResult => {
  const { today, previousKcal, body } = input
  const yesterday = addDays(today, -1)
  const firstWeighIn = input.weighIns
    .map((weighIn) => weighIn.date)
    .filter((date) => date <= today)
    .sort()[0]
  if (firstWeighIn === undefined) return { kind: 'blocked', reason: 'no_weigh_ins' }

  const points = trend(input.weighIns, addDays(yesterday, -WINDOW_MAX_DAYS), today)
  const trendWeightKg = roundTo(trendOn(points, today) ?? 0, 2)

  const complete = input.days.filter((day) => day.complete && day.date <= yesterday)
  const weekStart = addDays(yesterday, -(WEEK_DAYS - 1))
  const completeDaysInWeek = complete.filter((day) => day.date >= weekStart).length
  const enoughDays = completeDaysInWeek >= MIN_COMPLETE_DAYS_IN_WEEK

  if (previousKcal !== null && !enoughDays) {
    return { kind: 'skipped', reason: 'too_few_complete_days', completeDaysInWeek, trendWeightKg }
  }

  // The window runs from the day after its starting trend to yesterday.
  const windowDays = Math.min(WINDOW_MAX_DAYS, daysBetween(firstWeighIn, yesterday))
  const startTrend = trendOn(points, addDays(yesterday, -windowDays))
  const endTrend = trendOn(points, yesterday)

  if (windowDays >= WINDOW_MIN_DAYS && enoughDays && startTrend !== null && endTrend !== null) {
    const windowStart = addDays(yesterday, -(windowDays - 1))
    const inWindow = complete.filter((day) => day.date >= windowStart)
    const averageIntake = inWindow.reduce((sum, day) => sum + day.kcal, 0) / inWindow.length
    const changeKg = endTrend - startTrend
    const rawKcal = clamp(
      Math.round(averageIntake - (changeKg * KCAL_PER_KG) / windowDays),
      -RAW_LIMIT_KCAL,
      RAW_LIMIT_KCAL,
    )
    return {
      kind: 'updated',
      method: 'adaptive',
      rawKcal,
      maintenanceKcal: blend(previousKcal, rawKcal),
      trendWeightKg,
      completeDaysInWeek,
      window: {
        days: windowDays,
        completeDays: inWindow.length,
        averageIntakeKcal: Math.min(Math.round(averageIntake), AVERAGE_INTAKE_MAX_KCAL),
        trendChangeKg: roundTo(changeKg, 2),
      },
    }
  }

  const rawKcal = formulaRaw(body, trendWeightKg, today)
  if (rawKcal === null) return { kind: 'blocked', reason: 'profile_incomplete' }
  return {
    kind: 'updated',
    method: 'formula',
    rawKcal,
    maintenanceKcal: blend(previousKcal, rawKcal),
    trendWeightKg,
    completeDaysInWeek,
    window: null,
  }
}
