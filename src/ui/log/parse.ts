import { z } from 'zod/mini'

import type { QuickAdd } from '@/data/log'
import { limits } from '@/domain/limits'

import { toNumber } from '../food/forms'

const servings = z.number().check(z.gte(0.01), z.lte(limits.servings))

// Servings typed in a log dialog, or null when they don't parse or are out of range.
export const parseServings = (text: string): number | null => {
  const parsed = servings.safeParse(toNumber(text))
  return parsed.success ? parsed.data : null
}

// Phase 16: a quick add, as typed.
export type QuickAddValues = {
  name: string
  kcal: string
  proteinG: string
  carbsG: string
  fatG: string
}

export type QuickAddField = keyof QuickAddValues

export type QuickAddResult =
  | { ok: true; input: QuickAdd }
  | { ok: false; errors: Partial<Record<QuickAddField, true>> }

const quickName = z.string().check(z.trim(), z.minLength(1), z.maxLength(limits.nameLength))
// The same ranges as one serving of a food.
const quickKcal = z.int().check(z.gte(0), z.lte(limits.food.kcal))
const quickGrams = z.number().check(z.gte(0), z.lte(limits.food.grams))

export const parseQuickAdd = (values: QuickAddValues): QuickAddResult => {
  const errors: Partial<Record<QuickAddField, true>> = {}
  const name = quickName.safeParse(values.name)
  if (!name.success) errors.name = true
  const kcal = quickKcal.safeParse(toNumber(values.kcal))
  if (!kcal.success) errors.kcal = true
  const protein = quickGrams.safeParse(toNumber(values.proteinG))
  if (!protein.success) errors.proteinG = true
  // Carbs and fat may be left empty, as not set.
  const optional = (field: 'carbsG' | 'fatG'): number | null => {
    if (values[field].trim() === '') return null
    const parsed = quickGrams.safeParse(toNumber(values[field]))
    if (parsed.success) return parsed.data
    errors[field] = true
    return null
  }
  const carbsG = optional('carbsG')
  const fatG = optional('fatG')
  if (!name.success || !kcal.success || !protein.success || Object.keys(errors).length > 0) {
    return { ok: false, errors }
  }
  return {
    ok: true,
    input: { name: name.data, kcal: kcal.data, proteinG: protein.data, carbsG, fatG },
  }
}
