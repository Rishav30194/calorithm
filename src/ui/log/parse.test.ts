import { describe, expect, it } from 'vitest'

import { parseQuickAdd } from './parse'

// Phase 16: the quick add form.
describe('parseQuickAdd', () => {
  const values = { name: ' Thali ', kcal: '850', proteinG: '30', carbsG: '', fatG: '25,5' }

  it('reads the name and values, with empty carbs or fat as not set', () => {
    expect(parseQuickAdd(values)).toEqual({
      ok: true,
      input: { name: 'Thali', kcal: 850, proteinG: 30, carbsG: null, fatG: 25.5 },
    })
  })

  it('names each field that the database would refuse or that is missing', () => {
    expect(
      parseQuickAdd({ name: ' ', kcal: '850.5', proteinG: '', carbsG: '1000.1', fatG: '-1' }),
    ).toEqual({
      ok: false,
      errors: { name: true, kcal: true, proteinG: true, carbsG: true, fatG: true },
    })
    expect(parseQuickAdd({ ...values, kcal: '10001' })).toEqual({
      ok: false,
      errors: { kcal: true },
    })
  })
})
