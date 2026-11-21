import { describe, expect, it } from 'vitest'

import { parseWeighInForm } from './parse'

const today = '2026-11-21'

describe('parseWeighInForm', () => {
  it('stores kilograms as typed, with a decimal point or comma', () => {
    expect(parseWeighInForm({ day: today, weight: '82.4' }, 'kg', today)).toEqual({
      ok: true,
      weighIn: { date: today, kg: 82.4 },
    })
    expect(parseWeighInForm({ day: today, weight: '82,4' }, 'kg', today)).toMatchObject({
      weighIn: { kg: 82.4 },
    })
  })

  it('converts pounds to kilograms with two decimals', () => {
    expect(parseWeighInForm({ day: today, weight: '180' }, 'lb', today)).toMatchObject({
      weighIn: { kg: 81.65 },
    })
  })

  it('refuses a weight outside 20 to 400 kg, in either unit', () => {
    for (const [weight, unit] of [
      ['19.9', 'kg'],
      ['400.1', 'kg'],
      ['44', 'lb'],
      ['882', 'lb'],
      ['', 'kg'],
      ['abc', 'kg'],
      ['-80', 'kg'],
    ] as const) {
      expect(parseWeighInForm({ day: today, weight }, unit, today)).toEqual({
        ok: false,
        errors: { weight: true },
      })
    }
  })

  it('refuses a day in the future, before 2000, or not a day', () => {
    for (const day of ['2026-11-22', '1999-12-31', '2026-02-30', '']) {
      expect(parseWeighInForm({ day, weight: '80' }, 'kg', today)).toEqual({
        ok: false,
        errors: { day: true },
      })
    }
  })

  it('reports both errors together', () => {
    expect(parseWeighInForm({ day: '', weight: '' }, 'kg', today)).toEqual({
      ok: false,
      errors: { day: true, weight: true },
    })
  })
})
