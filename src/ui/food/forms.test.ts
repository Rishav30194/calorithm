import { describe, expect, it } from 'vitest'

import { strings } from '@/strings'

import { editableNumber, parseFoodForm, parseRecipeForm, toNumber } from './forms'

const food = {
  name: 'Oats',
  servingSize: '40',
  servingUnit: 'g',
  kcal: '150',
  proteinG: '5',
  carbsG: '27',
  fatG: '2,5',
  barcode: '',
}

describe('parseFoodForm', () => {
  it('turns valid text into a food', () => {
    expect(parseFoodForm(food)).toEqual({
      ok: true,
      input: {
        name: 'Oats',
        servingSize: 40,
        servingUnit: 'g',
        kcal: 150,
        proteinG: 5,
        carbsG: 27,
        fatG: 2.5,
      },
    })
  })

  it('accepts a decimal comma and surrounding spaces', () => {
    const parsed = parseFoodForm({ ...food, servingSize: ' 1,5 ', proteinG: '0,4' })
    expect(parsed).toMatchObject({ ok: true, input: { servingSize: 1.5, proteinG: 0.4 } })
  })

  it('reports every bad field at once, in form order', () => {
    const parsed = parseFoodForm({
      name: '  ',
      servingSize: '0',
      servingUnit: '',
      kcal: '12.5',
      proteinG: '-1',
      carbsG: '1000.5',
      fatG: 'some',
      barcode: '123',
    })
    expect(parsed).toEqual({
      ok: false,
      errors: {
        name: strings.foods.errors.name,
        servingSize: strings.foods.errors.servingSize,
        servingUnit: strings.foods.errors.servingUnit,
        kcal: strings.foods.errors.kcal,
        proteinG: strings.foods.errors.proteinG,
        carbsG: strings.foods.errors.carbsG,
        fatG: strings.foods.errors.fatG,
        barcode: strings.foods.errors.barcode,
      },
    })
  })

  // A food saved before carbs and fat existed gets them on its next edit (decision 0025).
  it('requires carbs and fat', () => {
    expect(parseFoodForm({ ...food, carbsG: '' })).toEqual({
      ok: false,
      errors: { carbsG: strings.foods.errors.carbsG },
    })
    expect(parseFoodForm({ ...food, fatG: ' ' })).toEqual({
      ok: false,
      errors: { fatG: strings.foods.errors.fatG },
    })
    expect(parseFoodForm({ ...food, carbsG: '0', fatG: '0' })).toMatchObject({
      ok: true,
      input: { carbsG: 0, fatG: 0 },
    })
  })

  it('rejects a thousands separator instead of reading it as a decimal mark', () => {
    expect(parseFoodForm({ ...food, servingSize: '1,000' })).toMatchObject({ ok: false })
    expect(parseFoodForm({ ...food, servingSize: '1.000' })).toMatchObject({ ok: false })
    expect(parseFoodForm({ ...food, kcal: '1,250' })).toMatchObject({ ok: false })
    expect(parseFoodForm({ ...food, servingSize: '1,25' })).toMatchObject({
      ok: true,
      input: { servingSize: 1.25 },
    })
  })

  it('rejects text that isn’t a number and values past the limits', () => {
    expect(parseFoodForm({ ...food, kcal: 'lots' })).toMatchObject({ ok: false })
    expect(parseFoodForm({ ...food, kcal: '10001' })).toMatchObject({ ok: false })
    expect(parseFoodForm({ ...food, servingSize: '0.004' })).toMatchObject({ ok: false })
    expect(parseFoodForm({ ...food, name: 'x'.repeat(101) })).toMatchObject({ ok: false })
    expect(parseFoodForm({ ...food, proteinG: '1000.1' })).toMatchObject({ ok: false })
  })
})

describe('parseFoodForm barcodes', () => {
  const errors = strings.foods.errors

  it('leaves the barcode out when the field is empty', () => {
    const parsed = parseFoodForm({ ...food, barcode: '  ' })
    expect(parsed.ok && 'barcode' in parsed.input).toBe(false)
  })

  it('saves a barcode in its stored form', () => {
    expect(parseFoodForm({ ...food, barcode: ' 036000 291452 ' })).toMatchObject({
      ok: true,
      input: { barcode: '0036000291452' },
    })
  })

  it('names a wrong length and a wrong check digit apart', () => {
    expect(parseFoodForm({ ...food, barcode: '12345' })).toEqual({
      ok: false,
      errors: { barcode: errors.barcode },
    })
    expect(parseFoodForm({ ...food, barcode: '6291041500214' })).toEqual({
      ok: false,
      errors: { barcode: errors.barcodeCheckDigit },
    })
  })

  // Sync can't clear a value back to not set (decision 0025), so the form doesn't offer it.
  it('refuses to remove a saved barcode, and accepts a changed one', () => {
    expect(parseFoodForm({ ...food, barcode: '' }, '6291041500213')).toEqual({
      ok: false,
      errors: { barcode: errors.barcodeKept },
    })
    expect(parseFoodForm({ ...food, barcode: '96385074' }, '6291041500213')).toMatchObject({
      ok: true,
      input: { barcode: '96385074' },
    })
  })
})

describe('parseRecipeForm', () => {
  const items = [{ foodId: 'f1', servings: '2' }]

  it('turns valid text into a recipe', () => {
    expect(parseRecipeForm({ name: ' Chili ', servings: '4', items })).toEqual({
      ok: true,
      input: { name: 'Chili', servings: 4, items: [{ foodId: 'f1', servings: 2 }] },
    })
  })

  it('needs at least one ingredient, and servings on each', () => {
    expect(parseRecipeForm({ name: 'Chili', servings: '4', items: [] })).toEqual({
      ok: false,
      errors: { items: strings.recipes.errors.items },
      itemErrors: {},
    })
    expect(
      parseRecipeForm({ name: 'Chili', servings: '0', items: [{ foodId: 'f1', servings: '' }] }),
    ).toEqual({
      ok: false,
      errors: { servings: strings.recipes.errors.servings },
      itemErrors: { f1: strings.recipes.errors.itemServings },
    })
  })
})

describe('editableNumber', () => {
  it('prefills a value the parser reads back, in any locale', () => {
    for (const locale of ['en-US', 'de-DE', 'fr-FR', 'ar-EG', 'fa-IR', 'hi-IN']) {
      for (const value of [1.5, 40, 0.33, 1234.5]) {
        expect(toNumber(editableNumber(value, locale))).toBe(value)
      }
    }
  })

  it('uses the locale’s decimal comma where it can', () => {
    expect(editableNumber(1.5, 'de-DE')).toBe('1,5')
    expect(editableNumber(1.5, 'en-US')).toBe('1.5')
  })
})
