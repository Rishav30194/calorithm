export type WeightUnit = 'kg' | 'lb'

const POUNDS_PER_KG = 2.2046226218

// Rounds half away from zero, so a 0.25 kg loss and gain both show as 0.3 (Math.round alone
// rounds -2.5 up to -2). Rounding before formatting also turns -0.01 into 0 instead of "-0".
const clean = (value: number, decimals: number): number => {
  const factor = 10 ** decimals
  const rounded = (Math.sign(value) * Math.round(Math.abs(value) * factor)) / factor
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
