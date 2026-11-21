import { roundProtein } from './nutrition'

// A kilogram of body weight is about 7,700 kcal, so 1 kg a week is 1,100 kcal a day.
export const KCAL_PER_KG = 7700
const KCAL_PER_DAY_PER_KG_PER_WEEK = KCAL_PER_KG / 7

// The goal rate is capped at this share of trend weight a week (decision 0009).
const RATE_CAP_SHARE = 0.01

export type TargetInput = {
  maintenanceKcal: number
  goalRateKgPerWeek: number
  // Rounded to hundredths, as stored, so the cap matches the database's check exactly.
  trendWeightKg: number
  proteinGPerKg: number
  calorieFloorKcal: number
}

export type Targets = {
  kcal: number
  proteinG: number
  appliedRateKgPerWeek: number
  rateCapped: boolean
  floorApplied: boolean
}

const hundredths = (value: number): number => Math.round(value * 100)

export const targets = (input: TargetInput): Targets => {
  const requested = hundredths(input.goalRateKgPerWeek)
  // Rounded down, so the applied rate never exceeds 1% of trend weight.
  const cap = Math.floor(hundredths(input.trendWeightKg) * RATE_CAP_SHARE)
  const applied = Math.sign(requested) * Math.min(Math.abs(requested), cap)
  const appliedRateKgPerWeek = applied / 100 + 0

  const unfloored = Math.round(
    input.maintenanceKcal + appliedRateKgPerWeek * KCAL_PER_DAY_PER_KG_PER_WEEK,
  )
  const floorApplied = unfloored < input.calorieFloorKcal

  return {
    kcal: floorApplied ? input.calorieFloorKcal : unfloored,
    proteinG: roundProtein(input.proteinGPerKg * input.trendWeightKg),
    appliedRateKgPerWeek,
    rateCapped: applied !== requested,
    floorApplied,
  }
}
