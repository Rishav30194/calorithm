import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  amountForServings,
  isMeasuredByWeight,
  servingsForAmount,
  weightPerServing,
} from './portion'

describe('weightPerServing', () => {
  it('reads a serving given in grams or ml, and in kg or litres', () => {
    expect(weightPerServing(100, 'g')).toEqual({ amount: 100, unit: 'g' })
    expect(weightPerServing(40, ' Grams ')).toEqual({ amount: 40, unit: 'g' })
    expect(weightPerServing(250, 'ml')).toEqual({ amount: 250, unit: 'ml' })
    expect(weightPerServing(0.5, 'kg')).toEqual({ amount: 500, unit: 'g' })
    expect(weightPerServing(1, 'l')).toEqual({ amount: 1000, unit: 'ml' })
  })

  it('reads the weight in brackets, as the built-in foods give it, per serving counted', () => {
    expect(weightPerServing(1, 'tsp (3 g)')).toEqual({ amount: 3, unit: 'g' })
    expect(weightPerServing(2, 'slice (30 g)')).toEqual({ amount: 60, unit: 'g' })
    expect(weightPerServing(1, 'tsp, ground (2.3 g)')).toEqual({ amount: 2.3, unit: 'g' })
    expect(weightPerServing(1, 'cup (240 ml)')).toEqual({ amount: 240, unit: 'ml' })
  })

  it('has no weight for a serving counted in pieces', () => {
    expect(weightPerServing(1, 'roti')).toBeNull()
    expect(weightPerServing(2, 'eggs')).toBeNull()
    expect(weightPerServing(1, 'glass')).toBeNull()
  })
})

describe('isMeasuredByWeight', () => {
  it('is true only when the serving itself is a weight or volume', () => {
    expect(isMeasuredByWeight('g')).toBe(true)
    expect(isMeasuredByWeight('ML')).toBe(true)
    expect(isMeasuredByWeight('tsp (3 g)')).toBe(false)
    expect(isMeasuredByWeight('roti')).toBe(false)
  })
})

describe('servingsForAmount and amountForServings', () => {
  const hundred = { amount: 100, unit: 'g' } as const

  it('turns 70 g of a 100 g serving into 0.7 servings, and back', () => {
    expect(servingsForAmount(70, hundred)).toBe(0.7)
    expect(servingsForAmount(150, hundred)).toBe(1.5)
    expect(amountForServings(0.7, hundred)).toBe(70)
  })

  it('rounds servings to the two decimals stored', () => {
    expect(servingsForAmount(5, { amount: 3, unit: 'g' })).toBe(1.67)
    expect(amountForServings(1.67, { amount: 3, unit: 'g' })).toBe(5)
  })

  it('round-trips any whole number of grams of a 100 g serving exactly', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100_000 }), (grams) => {
        expect(amountForServings(servingsForAmount(grams, hundred), hundred)).toBe(grams)
      }),
    )
  })

  it('stays within one stored step of the amount for any serving weight', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000 }),
        fc.integer({ min: 1, max: 100_000 }).map((tenths) => tenths / 10),
        (grams, weight) => {
          const perServing = { amount: weight, unit: 'g' } as const
          const back = amountForServings(servingsForAmount(grams, perServing), perServing)
          expect(Math.abs(back - grams)).toBeLessThanOrEqual(weight * 0.005 + 0.05)
        },
      ),
    )
  })
})
