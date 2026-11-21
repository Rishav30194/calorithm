import { useId } from 'react'

import { formatWeight } from '@/domain/format'
import type { TrendPoint } from '@/domain/trend'
import type { WeightUnit } from '@/domain/weight'
import { strings } from '@/strings'

import { CHART, chartGeometry } from './chart'
import { formatDay } from './days'

type Props = {
  points: readonly TrendPoint[]
  from: string
  to: string
  unit: WeightUnit
  locale: string
}

// The SVG is hidden from screen readers: the summary gives its range, and the weigh-ins table
// holds the same values.
export const WeightChart = ({ points, from, to, unit, locale }: Props) => {
  const titleId = useId()
  // The axis starts at the first point, so a short history fills the chart.
  const first = points[0]?.date ?? from
  const geometry = chartGeometry(points, first, to)
  if (!geometry) return null
  const low = formatWeight(geometry.lowKg, unit, locale)
  const high = formatWeight(geometry.highKg, unit, locale)
  // The summary names the real lowest and highest weigh-in, not the chart's widened bounds;
  // with no weigh-in in the window, the carried trend.
  const weighed = points.flatMap((point) => (point.weighInKg === null ? [] : [point.weighInKg]))
  const shown = weighed.length > 0 ? weighed : points.map((point) => point.trendKg)
  const lowest = formatWeight(Math.min(...shown), unit, locale)
  const highest = formatWeight(Math.max(...shown), unit, locale)
  const start = formatDay(first, locale)
  const end = formatDay(to, locale)

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2">
      <h2 id={titleId} className="text-lg font-semibold">
        {strings.weight.chartTitle}
      </h2>
      <p className="sr-only">{strings.weight.chartSummary(start, end, lowest, highest)}</p>
      <div aria-hidden="true" className="flex flex-col gap-1 text-sm text-muted">
        <span>{high}</span>
        <svg
          viewBox={`0 0 ${CHART.width} ${CHART.height}`}
          className="h-auto w-full rounded-lg bg-surface"
          role="presentation"
        >
          <path
            d={geometry.trendPath}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinejoin="round"
            className="text-accent"
          />
          {geometry.dots.map((dot) => (
            <circle key={dot.date} cx={dot.x} cy={dot.y} r="2.5" fill="currentColor" />
          ))}
        </svg>
        <span>{low}</span>
        <div className="flex justify-between">
          <span>{start}</span>
          <span>{end}</span>
        </div>
        <div className="flex gap-4">
          <span className="flex items-center gap-1">
            <svg viewBox="0 0 10 10" className="size-2.5" role="presentation">
              <circle cx="5" cy="5" r="4" fill="currentColor" />
            </svg>
            {strings.weight.legendWeighIns}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 bg-accent" />
            {strings.weight.legendTrend}
          </span>
        </div>
      </div>
    </section>
  )
}
