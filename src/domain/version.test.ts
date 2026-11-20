import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { compareVersions, isBelowMinimum } from './version'

const version = fc
  .tuple(fc.nat(50), fc.nat(50), fc.nat(50))
  .map(([major, minor, patch]) => `${major}.${minor}.${patch}`)

describe('compareVersions', () => {
  it('compares numerically, not as text', () => {
    expect(compareVersions('0.10.0', '0.9.0')).toBe(1)
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('1.2.3', '1.3.0')).toBe(-1)
  })

  it('rejects anything that is not MAJOR.MINOR.PATCH', () => {
    expect(compareVersions('1.0', '1.0.0')).toBeNull()
    expect(compareVersions('1.0.0', 'v1.0.0')).toBeNull()
    expect(compareVersions('1.0.0-beta', '1.0.0')).toBeNull()
  })

  it('is reflexive and antisymmetric', () => {
    fc.assert(
      fc.property(version, version, (a, b) => {
        expect(compareVersions(a, a)).toBe(0)
        expect(compareVersions(a, b)).toBe(-(compareVersions(b, a) ?? 0) || 0)
      }),
    )
  })
})

describe('isBelowMinimum', () => {
  it('is true only when the app is older than the minimum', () => {
    expect(isBelowMinimum('0.1.0', '0.2.0')).toBe(true)
    expect(isBelowMinimum('0.2.0', '0.2.0')).toBe(false)
    expect(isBelowMinimum('0.3.0', '0.2.0')).toBe(false)
  })

  it('never blocks the app over a malformed minimum', () => {
    expect(isBelowMinimum('0.1.0', 'garbage')).toBe(false)
  })
})
