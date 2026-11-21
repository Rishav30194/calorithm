import { z } from 'zod/mini'

import { profileSettings } from '@/data/profile'
import type { ActivityLevel, Sex } from '@/domain/maintenance'
import { roundTo } from '@/domain/nutrition'
import {
  cmFromFeetAndInches,
  feetAndInchesFromCm,
  type GoalDirection,
  goalRateFromKg,
  goalRateToKg,
  type ProfileField,
  type ProfileSettings,
  profileErrors,
} from '@/domain/profile'
import type { WeightUnit } from '@/domain/weight'

import { editableNumber, toNumber } from '../food/forms'

// The form's fields as typed. Metric shows height in centimeters; imperial in feet and inches.
export type ProfileFormValues = {
  heightCm: string
  heightFeet: string
  heightInches: string
  birthDate: string
  sex: Sex | ''
  activityLevel: ActivityLevel | ''
  goalDirection: GoalDirection
  goalAmount: string
  proteinGPerKg: string
  calorieFloorKcal: string
}

export type ProfileFormErrors = Partial<
  Record<'height' | 'birthDate' | 'goalRate' | 'protein' | 'calorieFloor', true>
>

export type ProfileFormResult =
  | { ok: true; changes: Partial<ProfileSettings> }
  | { ok: false; errors: ProfileFormErrors }

const wholeNumber = z.int()
const inchesInFoot = z.int().check(z.gte(0), z.lte(11))
const centimeters = z.number()
const amount = z.number().check(z.positive())
const protein = z.number()

// The parsed number, or NaN, which every range check refuses.
const parsed = (schema: z.ZodMiniType<number>, value: number): number => {
  const result = schema.safeParse(value)
  return result.success ? result.data : Number.NaN
}

// Null for an empty height.
const parseHeight = (values: ProfileFormValues, unit: WeightUnit): number | null => {
  if (unit === 'kg') {
    if (values.heightCm.trim() === '') return null
    const cm = parsed(centimeters, toNumber(values.heightCm))
    return Number.isNaN(cm) ? cm : roundTo(cm, 1)
  }
  const feetText = values.heightFeet.trim()
  const inchesText = values.heightInches.trim()
  if (feetText === '' && inchesText === '') return null
  const feet = parsed(wholeNumber, toNumber(feetText))
  const inches = inchesText === '' ? 0 : parsed(inchesInFoot, toNumber(inchesText))
  return Number.isNaN(feet) || Number.isNaN(inches) ? Number.NaN : cmFromFeetAndInches(feet, inches)
}

const parseGoalRate = (values: ProfileFormValues, unit: WeightUnit): number => {
  if (values.goalDirection === 'maintain') return 0
  const value = parsed(amount, toNumber(values.goalAmount))
  if (Number.isNaN(value)) return value
  const kg = goalRateToKg(values.goalDirection, value, unit)
  // An amount too small to store would save as keeping the weight.
  return kg === 0 ? Number.NaN : kg
}

const changed = (
  values: ProfileFormValues,
  shown: ProfileFormValues,
  fields: readonly (keyof ProfileFormValues)[],
): boolean => fields.some((field) => values[field] !== shown[field])

const errorFor: Record<ProfileField, keyof ProfileFormErrors | null> = {
  heightCm: 'height',
  birthDate: 'birthDate',
  goalRateKgPerWeek: 'goalRate',
  proteinGPerKg: 'protein',
  calorieFloorKcal: 'calorieFloor',
  // Sex and activity come from fixed choices.
  sex: null,
  activityLevel: null,
}

// Reads the fields that differ from what was shown into stored units. Untouched fields are
// left out, so the save keeps their stored values exactly, including ones that display
// rounded. The range checks are the profile table's, from profileErrors.
const changedSettings = (
  values: ProfileFormValues,
  shown: ProfileFormValues,
  unit: WeightUnit,
): Partial<ProfileSettings> => {
  const changes: Partial<ProfileSettings> = {}
  const heightFields =
    unit === 'kg' ? (['heightCm'] as const) : (['heightFeet', 'heightInches'] as const)
  if (changed(values, shown, heightFields)) changes.heightCm = parseHeight(values, unit)
  if (changed(values, shown, ['birthDate'])) {
    changes.birthDate = values.birthDate.trim() || null
  }
  if (changed(values, shown, ['sex'])) changes.sex = values.sex || null
  if (changed(values, shown, ['activityLevel']))
    changes.activityLevel = values.activityLevel || null
  if (changed(values, shown, ['goalDirection', 'goalAmount'])) {
    changes.goalRateKgPerWeek = parseGoalRate(values, unit)
  }
  if (changed(values, shown, ['proteinGPerKg'])) {
    changes.proteinGPerKg = parsed(protein, Number(values.proteinGPerKg || Number.NaN))
  }
  if (changed(values, shown, ['calorieFloorKcal'])) {
    changes.calorieFloorKcal = parsed(wholeNumber, toNumber(values.calorieFloorKcal))
  }
  return changes
}

export const parseProfileForm = (
  values: ProfileFormValues,
  shown: ProfileFormValues,
  unit: WeightUnit,
  today: string,
): ProfileFormResult => {
  const changes = changedSettings(values, shown, unit)

  // Each check covers one field, so defaults fill the rest without hiding a change's error.
  const errors: ProfileFormErrors = {}
  for (const field of profileErrors({ ...profileSettings(null), ...changes }, today)) {
    const error = errorFor[field]
    if (field in changes && error !== null) errors[error] = true
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, changes }
}

// Stored settings as form text, in the profile's units and the locale's decimal mark.
export const profileFormValues = (
  settings: ProfileSettings,
  unit: WeightUnit,
  locale: string,
): ProfileFormValues => {
  const height = settings.heightCm === null ? null : feetAndInchesFromCm(settings.heightCm)
  const goal = goalRateFromKg(settings.goalRateKgPerWeek, unit)
  return {
    heightCm: settings.heightCm === null ? '' : editableNumber(settings.heightCm, locale),
    heightFeet: height === null ? '' : String(height.feet),
    heightInches: height === null ? '' : String(height.inches),
    birthDate: settings.birthDate ?? '',
    sex: settings.sex ?? '',
    activityLevel: settings.activityLevel ?? '',
    goalDirection: goal.direction,
    goalAmount: goal.direction === 'maintain' ? '' : editableNumber(goal.amount, locale),
    proteinGPerKg: String(settings.proteinGPerKg),
    calorieFloorKcal: String(settings.calorieFloorKcal),
  }
}
