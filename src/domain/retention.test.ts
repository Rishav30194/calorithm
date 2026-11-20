import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { needsFullResync, RETENTION_DAYS } from './retention'

const DAY = 86_400_000
const now = Date.UTC(2026, 10, 20)

describe('needsFullResync', () => {
  it('is true for a device that has never pulled', () => {
    expect(needsFullResync(null, now)).toBe(true)
  })

  it('is false within the retention window and true past it', () => {
    expect(needsFullResync(now - (RETENTION_DAYS - 1) * DAY, now)).toBe(false)
    expect(needsFullResync(now - RETENTION_DAYS * DAY, now)).toBe(false)
    expect(needsFullResync(now - RETENTION_DAYS * DAY - 1, now)).toBe(true)
  })

  it('is false for a pull time ahead of the clock', () => {
    expect(needsFullResync(now + DAY, now)).toBe(false)
  })

  it('agrees with the age of the last pull', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 400 * DAY }), (age) => {
        expect(needsFullResync(now - age, now)).toBe(age > RETENTION_DAYS * DAY)
      }),
    )
  })
})
