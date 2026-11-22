import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { lookupBarcode } from './barcodeLookup'
import type { LocalDb } from './db'
import { createFood } from './foods'
import type { ProductLookup } from './openFoodFacts/lookup'
import { closeAll, manualClock, openDb, userId } from './sync/testing/fixtures'

let db: LocalDb
let time: ReturnType<typeof manualClock>

beforeEach(() => {
  db = openDb('calorithm-test-barcode-lookup')
  time = manualClock()
})

afterEach(closeAll)

const paneer = {
  name: 'Paneer',
  servingSize: 100,
  servingUnit: 'g',
  kcal: 265,
  proteinG: 18.3,
  carbsG: 1.2,
  fatG: 20.8,
  barcode: '0036000291452',
}

const product = {
  name: 'Peanut butter',
  servingSize: 100,
  servingUnit: 'g',
  kcal: 588,
  proteinG: 25,
  carbsG: 20,
  fatG: 50,
}

const remote = (result: ProductLookup) => vi.fn(async (_barcode: string) => result)

describe('lookupBarcode', () => {
  it('finds your saved food without asking Open Food Facts', async () => {
    const food = await createFood(db, time.clock, userId, paneer)
    const ask = remote({ kind: 'unreachable' })

    // A UPC-A scan finds the food saved under its EAN-13 form.
    expect(await lookupBarcode(db, '036000291452', ask)).toEqual({
      kind: 'saved',
      barcode: '0036000291452',
      foods: [expect.objectContaining({ id: food.id })],
    })
    expect(ask).not.toHaveBeenCalled()
  })

  it('asks Open Food Facts for the stored form when none of your foods has the barcode', async () => {
    const ask = remote({ kind: 'found', product })

    expect(await lookupBarcode(db, '036000 291452', ask)).toEqual({
      kind: 'product',
      barcode: '0036000291452',
      product,
    })
    expect(ask).toHaveBeenCalledWith('0036000291452')
  })

  it('passes on not found and unreachable with the barcode, for the form', async () => {
    expect(await lookupBarcode(db, '96385074', remote({ kind: 'not_found' }))).toEqual({
      kind: 'not_found',
      barcode: '96385074',
    })
    expect(await lookupBarcode(db, '96385074', remote({ kind: 'unreachable' }))).toEqual({
      kind: 'unreachable',
      barcode: '96385074',
    })
  })

  it('refuses a code that isn’t a barcode without any lookup', async () => {
    const ask = remote({ kind: 'not_found' })
    expect(await lookupBarcode(db, '12345', ask)).toEqual({ kind: 'invalid', reason: 'format' })
    expect(await lookupBarcode(db, '6291041500214', ask)).toEqual({
      kind: 'invalid',
      reason: 'check_digit',
    })
    expect(ask).not.toHaveBeenCalled()
  })
})
