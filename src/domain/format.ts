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

// Serving sizes and servings: stored with two decimals.
export const formatAmount = (value: number, locale: string): string => number(value, 2, locale)

export const formatProtein = (grams: number, locale: string): string =>
  `${number(grams, 1, locale)} g`

// Weights are stored in kilograms; pounds exist only on screen.
export const formatWeight = (kg: number, unit: WeightUnit, locale: string): string => {
  const value = unit === 'kg' ? kg : kg * POUNDS_PER_KG
  return `${number(value, 1, locale)} ${unit}`
}

const units: { unit: Intl.RelativeTimeFormatUnit; ms: number }[] = [
  { unit: 'day', ms: 86_400_000 },
  { unit: 'hour', ms: 3_600_000 },
  { unit: 'minute', ms: 60_000 },
]

// How long ago something happened, in the largest whole unit: "5 minutes ago", "yesterday".
export const formatAgo = (elapsedMs: number, locale: string): string => {
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const match = units.find(({ ms }) => elapsedMs >= ms)
  if (!match) return format.format(0, 'second')
  return format.format(-Math.floor(elapsedMs / match.ms), match.unit)
}
