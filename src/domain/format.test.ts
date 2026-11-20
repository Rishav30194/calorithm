import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { formatAgo, formatKcal, formatProtein, formatWeight } from './format'

describe('formatKcal', () => {
  it('rounds to a whole number with grouping', () => {
    expect(formatKcal(2150.4, 'en-GB')).toBe('2,150 kcal')
  })

  it('follows the locale grouping', () => {
    expect(formatKcal(2150, 'de-DE')).toBe('2.150 kcal')
  })
})

describe('formatProtein', () => {
  it('shows one decimal only when needed', () => {
    expect(formatProtein(142, 'en-GB')).toBe('142 g')
    expect(formatProtein(142.25, 'en-GB')).toBe('142.3 g')
  })
})

describe('formatWeight', () => {
  it('shows kilograms with one decimal', () => {
    expect(formatWeight(82.46, 'kg', 'en-GB')).toBe('82.5 kg')
  })

  it('converts to pounds for display only', () => {
    expect(formatWeight(82.5, 'lb', 'en-GB')).toBe('181.9 lb')
  })

  it('rounds losses and gains of the same size to the same number', () => {
    expect(formatWeight(0.25, 'kg', 'en-GB')).toBe('0.3 kg')
    expect(formatWeight(-0.25, 'kg', 'en-GB')).toBe('-0.3 kg')
  })

  it('never shows a negative zero', () => {
    expect(formatWeight(-0.01, 'kg', 'en-GB')).toBe('0 kg')
  })

  it('always ends in its unit', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 20, max: 400, noNaN: true }),
        fc.constantFrom('kg', 'lb'),
        (kg, unit) => {
          expect(formatWeight(kg, unit, 'en-GB').endsWith(` ${unit}`)).toBe(true)
        },
      ),
    )
  })
})

describe('formatAgo', () => {
  const minute = 60_000

  it('says now for under a minute', () => {
    expect(formatAgo(0, 'en-GB')).toBe('now')
    expect(formatAgo(59_000, 'en-GB')).toBe('now')
  })

  it('uses the largest whole unit', () => {
    expect(formatAgo(5 * minute, 'en-GB')).toBe('5 minutes ago')
    expect(formatAgo(2 * 60 * minute, 'en-GB')).toBe('2 hours ago')
    expect(formatAgo(26 * 60 * minute, 'en-GB')).toBe('yesterday')
    expect(formatAgo(3 * 24 * 60 * minute, 'en-GB')).toBe('3 days ago')
  })

  it('treats a time in the future as now', () => {
    expect(formatAgo(-5 * minute, 'en-GB')).toBe('now')
  })
})
