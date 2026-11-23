import { weekdayOf } from './dates'

// Higher-calorie days (decision 0033): the chosen weekdays get extraKcal more than the daily
// target, and the other days share the cost, so any 7 days in a row still add up to 7 times
// the target. Bit i of days is weekday i, Monday as 0 to Sunday as 6.
export type CalorieDays = { days: number; extraKcal: number }

// At least one day must give, so all seven can't be higher.
export const MAX_HIGHER_DAYS = 6
// The database's ranges: any mask but all seven days (127), and up to 5000 kcal extra.
export const MAX_HIGHER_DAYS_MASK = 126
export const MAX_HIGHER_KCAL_EXTRA = 5000

const WEEK = [0, 1, 2, 3, 4, 5, 6] as const

const isHigher = (days: number, weekday: number): boolean => (days & (1 << weekday)) !== 0

export const higherDayCount = (days: number): number =>
  WEEK.filter((weekday) => isHigher(days, weekday)).length

// The most each higher day can get while every lower day stays at or above the floor.
export const maxExtraKcal = (targetKcal: number, floorKcal: number, count: number): number =>
  count < 1 || count > MAX_HIGHER_DAYS || targetKcal <= floorKcal
    ? 0
    : Math.floor(((targetKcal - floorKcal) * (7 - count)) / count)

export type WeekTargets = {
  // Monday to Sunday.
  kcal: number[]
  // The extra applied: the setting's, or less when the floor trimmed it.
  extraKcal: number
  trimmed: boolean
}

export const weekTargets = (
  targetKcal: number,
  floorKcal: number,
  setting: CalorieDays,
): WeekTargets => {
  const count = higherDayCount(setting.days)
  const allowed = maxExtraKcal(targetKcal, floorKcal, count)
  const extraKcal = Math.min(Math.max(setting.extraKcal, 0), allowed)
  // Seven chosen days is no setting at all, so nothing is trimmed.
  const trimmed = count <= MAX_HIGHER_DAYS && count > 0 && extraKcal < setting.extraKcal
  if (extraKcal === 0) return { kcal: WEEK.map(() => targetKcal), extraKcal, trimmed }
  const lowerDays = 7 - count
  const cost = count * extraKcal
  const share = Math.floor(cost / lowerDays)
  // The kcal the even share leaves over come from the earliest lower days, one each.
  let remainder = cost - share * lowerDays
  const kcal = WEEK.map((weekday) => {
    if (isHigher(setting.days, weekday)) return targetKcal + extraKcal
    const one = remainder > 0 ? 1 : 0
    remainder -= one
    return targetKcal - share - one
  })
  return { kcal, extraKcal, trimmed }
}

export const kcalTargetOn = (
  day: string,
  targetKcal: number,
  floorKcal: number,
  setting: CalorieDays,
): number => weekTargets(targetKcal, floorKcal, setting).kcal[weekdayOf(day)] ?? targetKcal

// What a day's targets are worked out from: the latest check-in's targets, the higher of its
// floor and the profile's (so the profile form checks the same floor), and the setting.
export type WeekPlan = {
  kcalTarget: number
  proteinTargetG: number
  floorKcal: number
  calorieDays: CalorieDays
}

export type DayTargets = { kcal: number; proteinG: number; trimmed: boolean }

// A day's targets, and whether the floor trimmed this week's higher-calorie days.
export const dayTargets = (plan: WeekPlan, day: string): DayTargets => {
  const week = weekTargets(plan.kcalTarget, plan.floorKcal, plan.calorieDays)
  return {
    kcal: week.kcal[weekdayOf(day)] ?? plan.kcalTarget,
    proteinG: plan.proteinTargetG,
    trimmed: week.trimmed,
  }
}
