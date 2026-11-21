import type { ActivityLevel, Sex } from '@/domain/maintenance'
import { roundTo } from '@/domain/nutrition'
import {
  cmFromFeetAndInches,
  feetAndInchesFromCm,
  type GoalDirection,
  goalRateFromKg,
  goalRateToKg,
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
  | { ok: true; settings: ProfileSettings }
  | { ok: false; errors: ProfileFormErrors }

const wholeNumber = (text: string): number | null => {
  const value = toNumber(text)
  return Number.isInteger(value) ? value : null
}

// Null for an empty height, NaN for one that can't be read.
const parseHeight = (values: ProfileFormValues, unit: WeightUnit): number | null => {
  if (unit === 'kg') {
    if (values.heightCm.trim() === '') return null
    const cm = toNumber(values.heightCm)
    return Number.isNaN(cm) ? Number.NaN : roundTo(cm, 1)
  }
  const feetText = values.heightFeet.trim()
  const inchesText = values.heightInches.trim()
  if (feetText === '' && inchesText === '') return null
  const feet = wholeNumber(feetText)
  const inches = inchesText === '' ? 0 : wholeNumber(inchesText)
  if (feet === null || inches === null || inches > 11) return Number.NaN
  return cmFromFeetAndInches(feet, inches)
}

const parseGoalRate = (values: ProfileFormValues, unit: WeightUnit): number => {
  if (values.goalDirection === 'maintain') return 0
  const amount = toNumber(values.goalAmount)
  return amount > 0 ? goalRateToKg(values.goalDirection, amount, unit) : Number.NaN
}

// Reads the form into stored units; the range checks are the profile table's, from
// profileErrors, so the form refuses exactly what the database would.
export const parseProfileForm = (
  values: ProfileFormValues,
  unit: WeightUnit,
  today: string,
): ProfileFormResult => {
  const heightCm = parseHeight(values, unit)
  const settings: ProfileSettings = {
    heightCm,
    birthDate: values.birthDate.trim() === '' ? null : values.birthDate.trim(),
    sex: values.sex === '' ? null : values.sex,
    activityLevel: values.activityLevel === '' ? null : values.activityLevel,
    goalRateKgPerWeek: parseGoalRate(values, unit),
    proteinGPerKg: Number(values.proteinGPerKg),
    calorieFloorKcal: wholeNumber(values.calorieFloorKcal) ?? Number.NaN,
  }

  const errors: ProfileFormErrors = {}
  for (const field of profileErrors(settings, today)) {
    switch (field) {
      case 'heightCm':
        errors.height = true
        break
      case 'birthDate':
        errors.birthDate = true
        break
      case 'goalRateKgPerWeek':
        errors.goalRate = true
        break
      case 'proteinGPerKg':
        errors.protein = true
        break
      case 'calorieFloorKcal':
        errors.calorieFloor = true
        break
      // Sex and activity come from fixed choices.
      case 'sex':
      case 'activityLevel':
        break
    }
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, settings }
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
