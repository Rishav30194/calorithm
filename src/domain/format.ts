export type WeightUnit = 'kg' | 'lb'

const POUNDS_PER_KG = 2.204_622_621_8

// Rounding before formatting turns -0.01 into 0 instead of "-0".
const clean = (value: number, decimals: number): number => {
  const factor = 10 ** decimals
  const rounded = Math.round(value * factor) / factor
  return Object.is(rounded, -0) ? 0 : rounded
}

const number = (value: number, decimals: number, locale: string): string =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: decimals }).format(clean(value, decimals))

export const formatKcal = (kcal: number, locale: string): string =>
  `${number(kcal, 0, locale)} kcal`

export const formatProtein = (grams: number, locale: string): string =>
  `${number(grams, 1, locale)} g`

// Weights are stored in kilograms; pounds exist only on screen.
export const formatWeight = (kg: number, unit: WeightUnit, locale: string): string => {
  const value = unit === 'kg' ? kg : kg * POUNDS_PER_KG
  return `${number(value, 1, locale)} ${unit}`
}
