import { roundTo } from './nutrition'

export type WeightUnit = 'kg' | 'lb'

// The international pound, defined as exactly this many kilograms.
export const KG_PER_POUND = 0.45359237

// The weights table's range check.
export const WEIGHT_KG_MIN = 20
export const WEIGHT_KG_MAX = 400

// Weights are stored in kilograms with two decimals (numeric(5,2)); pounds exist only on screen.
export const toKg = (value: number, unit: WeightUnit): number =>
  roundTo(unit === 'kg' ? value : value * KG_PER_POUND, 2)

export const fromKg = (kg: number, unit: WeightUnit): number =>
  unit === 'kg' ? kg : kg / KG_PER_POUND

export const isWeightKgInRange = (kg: number): boolean => kg >= WEIGHT_KG_MIN && kg <= WEIGHT_KG_MAX
