import { type CalorieDays, MAX_HIGHER_DAYS_MASK, MAX_HIGHER_KCAL_EXTRA } from './calorieDays'
import { isDay } from './dates'
import type { ActivityLevel, Sex } from './maintenance'
import { roundTo } from './nutrition'
import { fromKg, toKg, type WeightUnit } from './weight'

// The profile fields a user edits, in stored units. Body fields stay empty until filled in;
// the check-in's formula needs them, the adaptive estimate doesn't.
export type ProfileSettings = {
  heightCm: number | null
  birthDate: string | null
  sex: Sex | null
  activityLevel: ActivityLevel | null
  goalRateKgPerWeek: number
  proteinGPerKg: number
  calorieFloorKcal: number
  // Null until first saved (decision 0033); no days chosen is { days: 0, extraKcal: 0 }.
  calorieDays: CalorieDays | null
}

export type ProfileField = keyof ProfileSettings

// The profile migration's checks.
export const HEIGHT_CM_MIN = 100
export const HEIGHT_CM_MAX = 250
export const EARLIEST_BIRTH_DATE = '1900-01-01'
export const GOAL_RATE_KG_MAX = 2
export const CALORIE_FLOOR_MIN = 1000
export const CALORIE_FLOOR_MAX = 3000
export const proteinOptions = [1.6, 1.7, 1.8, 1.9, 2, 2.1, 2.2] as const

const CM_PER_INCH = 2.54
const INCHES_PER_FOOT = 12

const hasDecimals = (value: number, places: number): boolean =>
  Math.abs(value * 10 ** places - Math.round(value * 10 ** places)) < 1e-6

const between = (value: number, min: number, max: number): boolean => value >= min && value <= max

// The fields that break a profile migration check, in the type's order. A birth date must be
// before today: the migration's trigger compares with the server's date in UTC, which can be
// a day behind the device's.
export const profileErrors = (settings: ProfileSettings, today: string): ProfileField[] => {
  const errors: ProfileField[] = []
  const { heightCm, birthDate } = settings
  if (
    heightCm !== null &&
    !(between(heightCm, HEIGHT_CM_MIN, HEIGHT_CM_MAX) && hasDecimals(heightCm, 1))
  ) {
    errors.push('heightCm')
  }
  if (
    birthDate !== null &&
    !(isDay(birthDate) && birthDate >= EARLIEST_BIRTH_DATE && birthDate < today)
  ) {
    errors.push('birthDate')
  }
  const rate = settings.goalRateKgPerWeek
  if (!(between(rate, -GOAL_RATE_KG_MAX, GOAL_RATE_KG_MAX) && hasDecimals(rate, 2))) {
    errors.push('goalRateKgPerWeek')
  }
  if (!proteinOptions.some((option) => Math.abs(option - settings.proteinGPerKg) < 1e-9)) {
    errors.push('proteinGPerKg')
  }
  const floor = settings.calorieFloorKcal
  if (!(Number.isInteger(floor) && between(floor, CALORIE_FLOOR_MIN, CALORIE_FLOOR_MAX))) {
    errors.push('calorieFloorKcal')
  }
  const days = settings.calorieDays
  if (
    days !== null &&
    !(
      Number.isInteger(days.days) &&
      between(days.days, 0, MAX_HIGHER_DAYS_MASK) &&
      Number.isInteger(days.extraKcal) &&
      between(days.extraKcal, 0, MAX_HIGHER_KCAL_EXTRA)
    )
  ) {
    errors.push('calorieDays')
  }
  return errors
}

// Heights are stored in centimeters with one decimal; imperial users enter whole inches.
export const cmFromFeetAndInches = (feet: number, inches: number): number =>
  roundTo((feet * INCHES_PER_FOOT + inches) * CM_PER_INCH, 1)

export const feetAndInchesFromCm = (cm: number): { feet: number; inches: number } => {
  const total = Math.round(cm / CM_PER_INCH)
  return { feet: Math.floor(total / INCHES_PER_FOOT), inches: total % INCHES_PER_FOOT }
}

export type GoalDirection = 'lose' | 'maintain' | 'gain'

// The goal rate is entered as a direction and an amount, since a phone's decimal keypad has
// no minus key. Stored in kg a week with two decimals.
export const goalRateToKg = (
  direction: GoalDirection,
  amount: number,
  unit: WeightUnit,
): number => {
  switch (direction) {
    case 'maintain':
      return 0
    case 'lose':
      return -toKg(amount, unit) + 0
    case 'gain':
      return toKg(amount, unit)
  }
}

// Kilograms show with two decimals and pounds with one, as entered.
export const goalRateFromKg = (
  kg: number,
  unit: WeightUnit,
): { direction: GoalDirection; amount: number } => {
  if (kg === 0) return { direction: 'maintain', amount: 0 }
  const amount = roundTo(fromKg(Math.abs(kg), unit), unit === 'kg' ? 2 : 1)
  return { direction: kg < 0 ? 'lose' : 'gain', amount }
}
