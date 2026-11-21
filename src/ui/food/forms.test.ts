import { describe, expect, it } from 'vitest'

import { strings } from '@/strings'

import { parseFoodForm, parseRecipeForm } from './forms'

const food = { name: 'Oats', servingSize: '40', servingUnit: 'g', kcal: '150', proteinG: '5' }

describe('parseFoodForm', () => {
  it('turns valid text into a food', () => {
    expect(parseFoodForm(food)).toEqual({
      ok: true,
      input: { name: 'Oats', servingSize: 40, servingUnit: 'g', kcal: 150, proteinG: 5 },
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
    })
    expect(parsed).toEqual({
      ok: false,
      errors: {
        name: strings.foods.errors.name,
        servingSize: strings.foods.errors.servingSize,
        servingUnit: strings.foods.errors.servingUnit,
        kcal: strings.foods.errors.kcal,
        proteinG: strings.foods.errors.proteinG,
      },
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
