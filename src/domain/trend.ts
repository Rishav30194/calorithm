import { addDays } from './dates'

export type WeighIn = { date: string; kg: number }

export type TrendPoint = { date: string; trendKg: number; weighInKg: number | null }

// Each weigh-in moves the trend this share of the way toward it.
const SMOOTHING = 0.1

// The trend weight for each day from `from` to `to`, both YYYY-MM-DD. The first weigh-in starts
// the trend, so days before it have no point; weigh-ins before `from` still count. A day
// without a weigh-in carries the trend forward. One weigh-in per date; for a repeated date the
// later one in the array wins.
export const trend = (weighIns: readonly WeighIn[], from: string, to: string): TrendPoint[] => {
  const byDate = new Map<string, number>()
  for (const { date, kg } of weighIns) {
    if (date <= to) byDate.set(date, kg)
  }
  const dates = [...byDate.keys()].sort()
  const first = dates[0]
  if (first === undefined) return []

  const points: TrendPoint[] = []
  let trendKg = byDate.get(first) ?? 0
  for (let date = first; date <= to; date = addDays(date, 1)) {
    const weighInKg = byDate.get(date) ?? null
    if (weighInKg !== null) trendKg += SMOOTHING * (weighInKg - trendKg)
    if (date >= from) points.push({ date, trendKg, weighInKg })
  }
  return points
}

// How far the trend moved in the `days` days up to `date`: negative for a loss. Null when
// either end has no trend, for example in the first week of weigh-ins.
export const trendChange = (
  points: readonly TrendPoint[],
  date: string,
  days: number,
): number | null => {
  const end = points.find((point) => point.date === date)
  const start = points.find((point) => point.date === addDays(date, -days))
  return end && start ? end.trendKg - start.trendKg : null
}
