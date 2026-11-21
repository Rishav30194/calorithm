import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { addDays } from './dates'
import { trend, type WeighIn } from './trend'

const at = (points: ReturnType<typeof trend>, date: string) =>
  points.find((point) => point.date === date)

describe('trend', () => {
  it('starts at the first weigh-in', () => {
    expect(trend([{ date: '2026-11-01', kg: 80 }], '2026-11-01', '2026-11-01')).toEqual([
      { date: '2026-11-01', trendKg: 80, weighInKg: 80 },
    ])
  })

  // Hand-computed: each weigh-in moves the trend 10% of the way toward it.
  // 11-02: 80 + 0.1 × (81 − 80) = 80.1
  // 11-03: no weigh-in, carried forward at 80.1
  // 11-04: 80.1 + 0.1 × (79 − 80.1) = 79.99
  // 11-05: 79.99 + 0.1 × (82 − 79.99) = 80.191
  it('matches hand-computed values, carrying the trend over a missing day', () => {
    const weighIns: WeighIn[] = [
      { date: '2026-11-01', kg: 80 },
      { date: '2026-11-02', kg: 81 },
      { date: '2026-11-04', kg: 79 },
      { date: '2026-11-05', kg: 82 },
    ]
    const points = trend(weighIns, '2026-11-01', '2026-11-05')
    expect(points.map((point) => point.date)).toEqual([
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
    ])
    expect(points.map((point) => point.weighInKg)).toEqual([80, 81, null, 79, 82])
    const trends = points.map((point) => point.trendKg)
    expect(trends[0]).toBe(80)
    expect(trends[1]).toBeCloseTo(80.1, 10)
    expect(trends[2]).toBeCloseTo(80.1, 10)
    expect(trends[3]).toBeCloseTo(79.99, 10)
    expect(trends[4]).toBeCloseTo(80.191, 10)
  })

  // Hand-computed: a steady 1 kg drop from a 90 kg start.
  // 11-02: 90 + 0.1 × (89 − 90) = 89.9
  // 11-03: 89.9 + 0.1 × (88 − 89.9) = 89.71
  it('lags behind a steady loss', () => {
    const points = trend(
      [
        { date: '2026-11-01', kg: 90 },
        { date: '2026-11-02', kg: 89 },
        { date: '2026-11-03', kg: 88 },
      ],
      '2026-11-01',
      '2026-11-03',
    )
    expect(at(points, '2026-11-03')?.trendKg).toBeCloseTo(89.71, 10)
  })

  it('counts weigh-ins before the range toward the trend, but returns only the range', () => {
    const points = trend(
      [
        { date: '2026-10-30', kg: 80 },
        { date: '2026-10-31', kg: 81 },
      ],
      '2026-11-01',
      '2026-11-02',
    )
    expect(points).toHaveLength(2)
    expect(points[0]).toEqual({
      date: '2026-11-01',
      trendKg: expect.closeTo(80.1, 10),
      weighInKg: null,
    })
  })

  it('starts the output at the first weigh-in when the range begins earlier', () => {
    const points = trend([{ date: '2026-11-03', kg: 80 }], '2026-11-01', '2026-11-04')
    expect(points.map((point) => point.date)).toEqual(['2026-11-03', '2026-11-04'])
  })

  it('ignores weigh-ins after the range', () => {
    const points = trend(
      [
        { date: '2026-11-01', kg: 80 },
        { date: '2026-11-03', kg: 100 },
      ],
      '2026-11-01',
      '2026-11-02',
    )
    expect(points.map((point) => point.trendKg)).toEqual([80, 80])
  })

  it('is empty with no weigh-ins, or none by the end of the range', () => {
    expect(trend([], '2026-11-01', '2026-11-30')).toEqual([])
    expect(trend([{ date: '2026-12-01', kg: 80 }], '2026-11-01', '2026-11-30')).toEqual([])
  })

  it('accepts weigh-ins in any order', () => {
    const sorted: WeighIn[] = [
      { date: '2026-11-01', kg: 80 },
      { date: '2026-11-02', kg: 81 },
    ]
    expect(trend([...sorted].reverse(), '2026-11-01', '2026-11-02')).toEqual(
      trend(sorted, '2026-11-01', '2026-11-02'),
    )
  })
})

// Weigh-ins on distinct days within a year, in kg with two decimals.
const history = fc
  .uniqueArray(
    fc.record({
      offset: fc.integer({ min: 0, max: 365 }),
      kg: fc.integer({ min: 2000, max: 40000 }).map((hundredths) => hundredths / 100),
    }),
    { minLength: 1, maxLength: 60, selector: (entry) => entry.offset },
  )
  .map((entries) => entries.map(({ offset, kg }) => ({ date: addDays('2026-01-01', offset), kg })))

const end = '2027-01-31'

describe('trend properties', () => {
  it('stays between the lowest and highest weigh-in so far', () => {
    fc.assert(
      fc.property(history, (weighIns) => {
        const sorted = [...weighIns].sort((a, b) => a.date.localeCompare(b.date))
        for (const point of trend(weighIns, '2026-01-01', end)) {
          const seen = sorted.filter((weighIn) => weighIn.date <= point.date).map((w) => w.kg)
          expect(point.trendKg).toBeGreaterThanOrEqual(Math.min(...seen) - 1e-9)
          expect(point.trendKg).toBeLessThanOrEqual(Math.max(...seen) + 1e-9)
        }
      }),
    )
  })

  it('carries the trend forward unchanged over a day without a weigh-in', () => {
    fc.assert(
      fc.property(history, (weighIns) => {
        const points = trend(weighIns, '2026-01-01', end)
        points.forEach((point, index) => {
          const previous = points[index - 1]
          if (point.weighInKg === null && previous) expect(point.trendKg).toBe(previous.trendKg)
        })
      }),
    )
  })

  it('gives a constant trend for a constant series', () => {
    fc.assert(
      fc.property(history, fc.integer({ min: 2000, max: 40000 }), (weighIns, hundredths) => {
        const kg = hundredths / 100
        const flat = weighIns.map((weighIn) => ({ ...weighIn, kg }))
        for (const point of trend(flat, '2026-01-01', end)) {
          expect(point.trendKg).toBeCloseTo(kg, 9)
        }
      }),
    )
  })

  it('returns one point per day, from the first weigh-in to the end of the range', () => {
    fc.assert(
      fc.property(history, (weighIns) => {
        const points = trend(weighIns, '2026-01-01', end)
        const first = [...weighIns].map((w) => w.date).sort()[0]
        expect(points[0]?.date).toBe(first)
        expect(points.at(-1)?.date).toBe(end)
        points.forEach((point, index) => {
          const next = points[index + 1]
          if (next) expect(next.date).toBe(addDays(point.date, 1))
        })
      }),
    )
  })
})
