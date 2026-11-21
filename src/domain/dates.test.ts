import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { addDays, EARLIEST_DAY, isDay } from './dates'

const day = fc
  .integer({ min: Date.UTC(2000, 0, 1), max: Date.UTC(2100, 0, 1) })
  .map((ms) => new Date(ms).toISOString().slice(0, 10))

describe('addDays', () => {
  it('moves across month, year, and leap-day boundaries', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28')
    expect(addDays('2026-11-21', -60)).toBe('2026-09-22')
  })

  it('undoes itself and composes', () => {
    fc.assert(
      fc.property(
        day,
        fc.integer({ min: -400, max: 400 }),
        fc.integer({ min: -400, max: 400 }),
        (start, a, b) => {
          expect(addDays(addDays(start, a), -a)).toBe(start)
          expect(addDays(addDays(start, a), b)).toBe(addDays(start, a + b))
          expect(isDay(addDays(start, a))).toBe(true)
        },
      ),
    )
  })

  it('keeps calendar order', () => {
    fc.assert(
      fc.property(day, fc.integer({ min: 1, max: 400 }), (start, n) => {
        expect(addDays(start, n) > start).toBe(true)
      }),
    )
  })
})

describe('isDay', () => {
  it('accepts real calendar days only', () => {
    expect(isDay('2026-11-21')).toBe(true)
    expect(isDay('2028-02-29')).toBe(true)
    expect(isDay('2027-02-29')).toBe(false)
    expect(isDay('2026-13-01')).toBe(false)
    expect(isDay('21/11/2026')).toBe(false)
  })
})

describe('EARLIEST_DAY', () => {
  it('is the first day the database accepts, and a real day', () => {
    expect(EARLIEST_DAY).toBe('2000-01-01')
    expect(isDay(EARLIEST_DAY)).toBe(true)
  })
})
