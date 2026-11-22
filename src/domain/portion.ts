import { roundServings, roundTo } from './nutrition'

// How much one serving weighs, in grams or ml, when its unit says so.
export type Portion = { amount: number; unit: 'g' | 'ml' }

const UNITS: Record<string, Portion> = {
  g: { amount: 1, unit: 'g' },
  gm: { amount: 1, unit: 'g' },
  gms: { amount: 1, unit: 'g' },
  gram: { amount: 1, unit: 'g' },
  grams: { amount: 1, unit: 'g' },
  kg: { amount: 1000, unit: 'g' },
  ml: { amount: 1, unit: 'ml' },
  l: { amount: 1000, unit: 'ml' },
  litre: { amount: 1000, unit: 'ml' },
  liter: { amount: 1000, unit: 'ml' },
}

const unitOf = (servingUnit: string): Portion | undefined => UNITS[servingUnit.trim().toLowerCase()]

// True when the serving itself is a weight or volume, such as "100 g", rather than a piece.
export const isMeasuredByWeight = (servingUnit: string): boolean =>
  unitOf(servingUnit) !== undefined

// A serving's weight: from its unit ("100 g"), or from a weight in brackets, as the built-in
// foods give it ("tsp (3 g)"), times the servings counted. Null for pieces ("1 roti").
export const weightPerServing = (servingSize: number, servingUnit: string): Portion | null => {
  const unit = unitOf(servingUnit)
  if (unit) return { amount: roundTo(servingSize * unit.amount, 2), unit: unit.unit }
  const bracket = /\(\s*(\d+(?:[.,]\d+)?)\s*(g|ml)\s*\)/i.exec(servingUnit)
  if (!bracket) return null
  const each = Number((bracket[1] ?? '').replace(',', '.'))
  return {
    amount: roundTo(servingSize * each, 2),
    unit: bracket[2]?.toLowerCase() === 'ml' ? 'ml' : 'g',
  }
}

// Servings for an amount, rounded to the two decimals stored.
export const servingsForAmount = (amount: number, perServing: Portion): number =>
  roundServings(amount / perServing.amount)

// The amount servings come to, to one decimal.
export const amountForServings = (servings: number, perServing: Portion): number =>
  roundTo(servings * perServing.amount, 1)
