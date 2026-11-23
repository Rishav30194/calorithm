import { z } from 'zod/mini'

import type { FoodInput, RecipeInput } from '@/data/foods'
import { parseBarcode } from '@/domain/barcode'
import { limits } from '@/domain/limits'
import { strings } from '@/strings'

// Form fields hold text as typed. One decimal mark, a point or a comma, may follow with up to
// two digits; three digits after it ("1,000") are a thousands separator in some locales and a
// decimal in others, so they're refused rather than guessed.
export const toNumber = (text: string): number => {
  const clean = text.trim()
  return /^\d+([.,]\d{1,2})?$/.test(clean) ? Number(clean.replace(',', '.')) : Number.NaN
}

// A stored number as text the user can edit and toNumber reads back: the locale's decimal
// comma where it has one, but always Latin digits, since toNumber reads no others.
export const editableNumber = (value: number, locale: string): string => {
  const text = new Intl.NumberFormat(locale, {
    numberingSystem: 'latn',
    maximumFractionDigits: 2,
    useGrouping: false,
  }).format(value)
  return Number.isNaN(toNumber(text)) ? String(value) : text
}

const name = z.string().check(z.trim(), z.minLength(1), z.maxLength(limits.nameLength))
const unit = z.string().check(z.trim(), z.minLength(1), z.maxLength(limits.unitLength))
// Two decimals are stored, so anything below 0.01 would round to zero.
const servings = (max: number) => z.number().check(z.gte(0.01), z.lte(max))
const kcal = z.int().check(z.gte(0), z.lte(limits.food.kcal))
// Protein, carbs, and fat per serving, in grams.
const grams = z.number().check(z.gte(0), z.lte(limits.food.grams))

type Errors<Field extends string> = Partial<Record<Field, string>>

// Runs a field's check and records its message when it fails.
const field = <T, Field extends string>(
  errors: Errors<Field>,
  key: Field,
  schema: z.ZodMiniType<T>,
  value: unknown,
  message: string,
): T | undefined => {
  const parsed = schema.safeParse(value)
  if (parsed.success) return parsed.data
  errors[key] = message
  return undefined
}

export type FoodFormValues = {
  name: string
  servingSize: string
  servingUnit: string
  kcal: string
  proteinG: string
  carbsG: string
  fatG: string
  barcode: string
}

export type FoodField = keyof FoodFormValues

export type FoodFormResult =
  | { ok: true; input: FoodInput }
  | { ok: false; errors: Errors<FoodField> }

// An empty field means no barcode, unless the food has one saved: sync can't clear it back to
// not set (decision 0025), so the field then must hold a barcode.
const barcodeField = (
  errors: Errors<FoodField>,
  text: string,
  saved: string | null,
): { barcode?: string } | undefined => {
  const messages = strings.foods.errors
  if (text.trim() === '') {
    if (saved === null) return {}
    errors.barcode = messages.barcodeKept
    return undefined
  }
  const parsed = parseBarcode(text)
  if (parsed.ok) return { barcode: parsed.barcode }
  errors.barcode = parsed.reason === 'check_digit' ? messages.barcodeCheckDigit : messages.barcode
  return undefined
}

export const parseFoodForm = (
  values: FoodFormValues,
  savedBarcode: string | null = null,
): FoodFormResult => {
  const errors: Errors<FoodField> = {}
  const messages = strings.foods.errors
  const parsed = {
    name: field(errors, 'name', name, values.name, messages.name),
    servingSize: field(
      errors,
      'servingSize',
      servings(limits.food.servingSize),
      toNumber(values.servingSize),
      messages.servingSize,
    ),
    servingUnit: field(errors, 'servingUnit', unit, values.servingUnit, messages.servingUnit),
    kcal: field(errors, 'kcal', kcal, toNumber(values.kcal), messages.kcal),
    proteinG: field(errors, 'proteinG', grams, toNumber(values.proteinG), messages.proteinG),
    carbsG: field(errors, 'carbsG', grams, toNumber(values.carbsG), messages.carbsG),
    fatG: field(errors, 'fatG', grams, toNumber(values.fatG), messages.fatG),
    barcode: barcodeField(errors, values.barcode, savedBarcode),
  }
  const { name: n, servingSize, servingUnit, kcal: k, proteinG, carbsG, fatG, barcode } = parsed
  if (
    n === undefined ||
    servingSize === undefined ||
    servingUnit === undefined ||
    k === undefined ||
    proteinG === undefined ||
    carbsG === undefined ||
    fatG === undefined ||
    barcode === undefined
  ) {
    return { ok: false, errors }
  }
  return {
    ok: true,
    input: { name: n, servingSize, servingUnit, kcal: k, proteinG, carbsG, fatG, ...barcode },
  }
}

export type RecipeFormValues = {
  name: string
  servings: string
  items: { foodId: string; servings: string }[]
}

export type RecipeField = 'name' | 'servings' | 'items'

export type RecipeFormResult =
  | { ok: true; input: RecipeInput }
  | { ok: false; errors: Errors<RecipeField>; itemErrors: Record<string, string> }

export const parseRecipeForm = (values: RecipeFormValues): RecipeFormResult => {
  const errors: Errors<RecipeField> = {}
  const messages = strings.recipes.errors
  const parsedName = field(errors, 'name', name, values.name, messages.name)
  const parsedServings = field(
    errors,
    'servings',
    servings(limits.servings),
    toNumber(values.servings),
    messages.servings,
  )
  if (values.items.length === 0) errors.items = messages.items

  const itemErrors: Record<string, string> = {}
  const items: RecipeInput['items'] = []
  for (const item of values.items) {
    const parsed = servings(limits.servings).safeParse(toNumber(item.servings))
    if (parsed.success) items.push({ foodId: item.foodId, servings: parsed.data })
    else itemErrors[item.foodId] = messages.itemServings
  }

  if (
    parsedName === undefined ||
    parsedServings === undefined ||
    Object.keys(errors).length > 0 ||
    Object.keys(itemErrors).length > 0
  ) {
    return { ok: false, errors, itemErrors }
  }
  return { ok: true, input: { name: parsedName, servings: parsedServings, items } }
}
