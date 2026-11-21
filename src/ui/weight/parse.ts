import { z } from 'zod/mini'

import type { WeighIn } from '@/domain/trend'
import { isWeightKgInRange, toKg, type WeightUnit } from '@/domain/weight'

import { toNumber } from '../food/forms'

export type WeighInErrors = { day?: true; weight?: true }

export type WeighInFormResult =
  | { ok: true; weighIn: WeighIn }
  | { ok: false; errors: WeighInErrors }

const day = z.iso.date()
const amount = z.number().check(z.positive())

// The weigh-in form's day and weight, typed in the profile's unit and stored in kg. A day must
// be from 2000, which the database requires, up to today.
export const parseWeighInForm = (
  values: { day: string; weight: string },
  unit: WeightUnit,
  today: string,
): WeighInFormResult => {
  const errors: WeighInErrors = {}
  const parsedDay = day.safeParse(values.day)
  const validDay =
    parsedDay.success && parsedDay.data >= '2000-01-01' && parsedDay.data <= today
      ? parsedDay.data
      : null
  if (validDay === null) errors.day = true

  const parsedWeight = amount.safeParse(toNumber(values.weight))
  const kg = parsedWeight.success ? toKg(parsedWeight.data, unit) : null
  if (kg === null || !isWeightKgInRange(kg)) errors.weight = true

  if (validDay === null || kg === null || errors.weight) return { ok: false, errors }
  return { ok: true, weighIn: { date: validDay, kg } }
}
