import { describe, expect, it } from 'vitest'

import { trend } from '@/domain/trend'

import { CHART, chartGeometry } from './chart'

const bottom = CHART.height - CHART.bottom
const right = CHART.width - CHART.right

describe('chartGeometry', () => {
  it('is null without points', () => {
    expect(chartGeometry([], '2026-11-01', '2026-11-30')).toBeNull()
  })

  it('spans the days across and the weights down, highest at the top', () => {
    const points = trend(
      [
        { date: '2026-11-01', kg: 82 },
        { date: '2026-11-03', kg: 80 },
      ],
      '2026-11-01',
      '2026-11-03',
    )
    const geometry = chartGeometry(points, '2026-11-01', '2026-11-03')
    expect(geometry?.lowKg).toBe(80)
    expect(geometry?.highKg).toBe(82)
    expect(geometry?.dots).toEqual([
      { date: '2026-11-01', x: CHART.left, y: CHART.top },
      { date: '2026-11-03', x: right, y: bottom },
    ])
    // The middle day sits at 8 + 304 ÷ 2 = 160. The trend: 82, carried at 82, then
    // 82 + 0.1 × (80 − 82) = 81.8, which is 12 + (0.2 ÷ 2) × 136 = 25.6 down.
    expect(geometry?.trendPath).toBe(`M${CHART.left} ${CHART.top} L160 ${CHART.top} L${right} 25.6`)
  })

  it('widens a range under 1 kg around its middle', () => {
    const points = trend([{ date: '2026-11-01', kg: 80 }], '2026-11-01', '2026-11-01')
    const geometry = chartGeometry(points, '2026-11-01', '2026-11-01')
    expect(geometry?.lowKg).toBe(79.5)
    expect(geometry?.highKg).toBe(80.5)
    expect(geometry?.dots[0]?.y).toBe(CHART.top + (bottom - CHART.top) / 2)
  })

  it('keeps every point inside the plot', () => {
    const weighIns = Array.from({ length: 90 }, (_, index) => ({
      date: new Date(Date.UTC(2026, 7, 24 + index)).toISOString().slice(0, 10),
      kg: 80 + Math.sin(index) * 3,
    }))
    const points = trend(weighIns, '2026-08-24', '2026-11-21')
    const geometry = chartGeometry(points, '2026-08-24', '2026-11-21')
    for (const dot of geometry?.dots ?? []) {
      expect(dot.x).toBeGreaterThanOrEqual(CHART.left)
      expect(dot.x).toBeLessThanOrEqual(right)
      expect(dot.y).toBeGreaterThanOrEqual(CHART.top)
      expect(dot.y).toBeLessThanOrEqual(bottom)
    }
  })
})
