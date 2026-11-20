import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { BACKOFF_MAX_MS, BACKOFF_MIN_MS, backoffMs } from './backoff'

describe('backoffMs', () => {
  it('grows with each attempt until the cap', () => {
    // random = 1 gives the top of each attempt's range.
    expect(backoffMs(1, 1)).toBe(2_000)
    expect(backoffMs(2, 1)).toBe(4_000)
    expect(backoffMs(3, 1)).toBe(8_000)
    expect(backoffMs(20, 1)).toBe(BACKOFF_MAX_MS)
  })

  it('never waits less than the floor', () => {
    expect(backoffMs(1, 0)).toBe(BACKOFF_MIN_MS)
  })

  it('stays within the floor and the cap for any attempt and random value', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (attempt, random) => {
          const delay = backoffMs(attempt, random)
          expect(delay).toBeGreaterThanOrEqual(BACKOFF_MIN_MS)
          expect(delay).toBeLessThanOrEqual(BACKOFF_MAX_MS)
          expect(Number.isInteger(delay)).toBe(true)
        },
      ),
    )
  })

  it('never lowers the ceiling as attempts grow', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 999 }), (attempt) => {
        expect(backoffMs(attempt + 1, 1)).toBeGreaterThanOrEqual(backoffMs(attempt, 1))
      }),
    )
  })

  it('treats attempts below 1 as the first attempt', () => {
    expect(backoffMs(0, 1)).toBe(backoffMs(1, 1))
  })
})
