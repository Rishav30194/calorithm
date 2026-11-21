import { z } from 'zod/mini'

import type { FoodInput, RecipeInput } from '@/data/foods'
import { strings } from '@/strings'

// Form fields hold text as typed. One decimal mark, a point or a comma, may follow with up to
// two digits; three digits after it ("1,000") are a thousands separator in some locales and a
// decimal in others, so they're refused rather than guessed.
export const toNumber = (text: string): number => {
  const clean = text.trim()
  return /^\d+([.,]\d{1,2})?$/.test(clean) ? Number(clean.replace(',', '.')) : Number.NaN
}

const name = z.string().check(z.trim(), z.minLength(1), z.maxLength(100))
const unit = z.string().check(z.trim(), z.minLength(1), z.maxLength(20))
// Two decimals are stored, so anything below 0.01 would round to zero.
const servings = (max: number) => z.number().check(z.gte(0.01), z.lte(max))
const kcal = z.int().check(z.gte(0), z.lte(10_000))
const protein = z.number().check(z.gte(0), z.lte(1_000))

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
}

export type FoodField = keyof FoodFormValues

export type FoodFormResult =
  | { ok: true; input: FoodInput }
  | { ok: false; errors: Errors<FoodField> }

export const parseFoodForm = (values: FoodFormValues): FoodFormResult => {
  const errors: Errors<FoodField> = {}
  const messages = strings.foods.errors
  const parsed = {
    name: field(errors, 'name', name, values.name, messages.name),
    servingSize: field(
      errors,
      'servingSize',
      servings(10_000),
      toNumber(values.servingSize),
      messages.servingSize,
    ),
    servingUnit: field(errors, 'servingUnit', unit, values.servingUnit, messages.servingUnit),
    kcal: field(errors, 'kcal', kcal, toNumber(values.kcal), messages.kcal),
    proteinG: field(errors, 'proteinG', protein, toNumber(values.proteinG), messages.proteinG),
  }
  const { name: n, servingSize, servingUnit, kcal: k, proteinG } = parsed
  if (
    n === undefined ||
    servingSize === undefined ||
    servingUnit === undefined ||
    k === undefined ||
    proteinG === undefined
  ) {
    return { ok: false, errors }
  }
  return { ok: true, input: { name: n, servingSize, servingUnit, kcal: k, proteinG } }
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
    servings(1_000),
    toNumber(values.servings),
    messages.servings,
  )
  if (values.items.length === 0) errors.items = messages.items

  const itemErrors: Record<string, string> = {}
  const items: RecipeInput['items'] = []
  for (const item of values.items) {
    const parsed = servings(1_000).safeParse(toNumber(item.servings))
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
