import type { TrendPoint } from '@/domain/trend'

export const CHART = { width: 320, height: 160, left: 8, right: 8, top: 12, bottom: 12 }

export type ChartGeometry = {
  dots: { date: string; x: number; y: number }[]
  // An SVG path through the trend, one point per day; empty without points.
  trendPath: string
  lowKg: number
  highKg: number
}

const DAY_MS = 86_400_000
const dayIndex = (from: string, date: string): number =>
  Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)

// Places the days from `from` to `to` across the chart, and the weights from the lowest to the
// highest value shown, weigh-in or trend, down it. A range under 1 kg is widened to 1 kg so a
// steady weight doesn't fill the chart with noise.
export const chartGeometry = (
  points: readonly TrendPoint[],
  from: string,
  to: string,
): ChartGeometry | null => {
  if (points.length === 0) return null
  const values = points.flatMap((point) =>
    point.weighInKg === null ? [point.trendKg] : [point.trendKg, point.weighInKg],
  )
  let low = Math.min(...values)
  let high = Math.max(...values)
  if (high - low < 1) {
    const middle = (high + low) / 2
    low = middle - 0.5
    high = middle + 0.5
  }

  const span = Math.max(1, dayIndex(from, to))
  const plotWidth = CHART.width - CHART.left - CHART.right
  const plotHeight = CHART.height - CHART.top - CHART.bottom
  const x = (date: string) => CHART.left + (dayIndex(from, date) / span) * plotWidth
  const y = (kg: number) => CHART.top + ((high - kg) / (high - low)) * plotHeight
  const round = (value: number) => Math.round(value * 10) / 10

  return {
    dots: points.flatMap((point) =>
      point.weighInKg === null
        ? []
        : [{ date: point.date, x: round(x(point.date)), y: round(y(point.weighInKg)) }],
    ),
    trendPath: points
      .map(
        (point, index) =>
          `${index === 0 ? 'M' : 'L'}${round(x(point.date))} ${round(y(point.trendKg))}`,
      )
      .join(' '),
    lowKg: low,
    highKg: high,
  }
}
