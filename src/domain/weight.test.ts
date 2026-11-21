import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { fromKg, isWeightKgInRange, toKg, WEIGHT_KG_MAX, WEIGHT_KG_MIN } from './weight'

describe('toKg', () => {
  it('keeps kilograms, rounded to two decimals', () => {
    expect(toKg(82.4, 'kg')).toBe(82.4)
    expect(toKg(82.345, 'kg')).toBe(82.35)
  })

  // 1 lb is exactly 0.45359237 kg: 180 × 0.45359237 = 81.6466266
  it('converts pounds with the exact factor, rounded to two decimals', () => {
    expect(toKg(180, 'lb')).toBe(81.65)
    expect(toKg(1, 'lb')).toBe(0.45)
  })
})

describe('fromKg', () => {
  it('returns kilograms as stored, and pounds unrounded', () => {
    expect(fromKg(81.65, 'kg')).toBe(81.65)
    expect(fromKg(0.45359237, 'lb')).toBeCloseTo(1, 12)
  })
})

describe('isWeightKgInRange', () => {
  it('accepts 20 to 400 kg inclusive', () => {
    expect(isWeightKgInRange(WEIGHT_KG_MIN)).toBe(true)
    expect(isWeightKgInRange(WEIGHT_KG_MAX)).toBe(true)
    expect(isWeightKgInRange(19.99)).toBe(false)
    expect(isWeightKgInRange(400.01)).toBe(false)
    expect(isWeightKgInRange(Number.NaN)).toBe(false)
  })
})

const decimalsOf = (value: number): number => (String(value).split('.')[1] ?? '').length

const round1 = (value: number): number => Math.round(value * 10) / 10

describe('unit properties', () => {
  it('stores at most two decimals', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1000, noNaN: true }),
        fc.constantFrom('kg', 'lb'),
        (value, unit) => {
          expect(decimalsOf(toKg(value, unit))).toBeLessThanOrEqual(2)
        },
      ),
    )
  })

  // Entry in pounds shows one decimal, so a stored value must show the same number back.
  it('gives back any pound value entered with one decimal', () => {
    fc.assert(
      fc.property(fc.integer({ min: 441, max: 8818 }), (tenths) => {
        const pounds = tenths / 10
        expect(round1(fromKg(toKg(pounds, 'lb'), 'lb'))).toBe(pounds)
      }),
    )
  })

  it('never changes a stored value when entered again in kilograms', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2000, max: 40000 }), (hundredths) => {
        const kg = hundredths / 100
        expect(toKg(fromKg(kg, 'kg'), 'kg')).toBe(kg)
      }),
    )
  })
})
