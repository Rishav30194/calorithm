import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { parseNutritionLabel } from './label'

// Synthetic labels in each layout the parser reads; the values are made up.
const usPanel = `Nutrition Facts
8 servings per container
Serving size 2/3 cup (55g)
Amount per serving
Calories 230
% Daily Value*
Total Fat 8g 10%
Saturated Fat 1g 5%
Trans Fat 0g
Cholesterol 0mg 0%
Sodium 160mg 7%
Total Carbohydrate 37g 13%
Dietary Fiber 4g 14%
Total Sugars 12g
Includes 10g Added Sugars 20%
Protein 3g
* The % Daily Value tells you how much a nutrient in a serving of food contributes to a daily
diet. 2,000 calories a day is used for general nutrition advice.`

const euTable = `NUTRITION INFORMATION
Typical values Per 100g Per 30g serving
Energy 1569kJ/373kcal 471kJ/112kcal
Fat 6.8g 2.0g
of which saturates 1.2g 0.4g
Carbohydrate 62.1g 18.6g
of which sugars 4.5g 1.4g
Fibre 9.9g 3.0g
Protein 11.2g 3.4g
Salt 0.02g 0.01g`

const indianTable = `NUTRITIONAL INFORMATION (Approx.)
Per 100 g of product
Energy (kcal) 456
Protein (g) 7.2
Carbohydrate (g) 64.5
Total Sugars (g) 18.0
Added Sugars (g) 15.2
Total Fat (g) 18.9
Saturated Fat (g) 9.1
Trans Fat (g) 0.1
Sodium (mg) 380`

describe('parseNutritionLabel', () => {
  it('reads a US Nutrition Facts panel per serving, skipping % Daily Value and the footnote', () => {
    expect(parseNutritionLabel(usPanel)).toEqual({
      basis: { size: 55, unit: 'g' },
      kcal: 230,
      proteinG: 3,
      carbsG: 37,
      fatG: 8,
    })
  })

  it('reads an EU table from its per-100 g column, with kcal beside kJ', () => {
    expect(parseNutritionLabel(euTable)).toEqual({
      basis: { size: 100, unit: 'g' },
      kcal: 373,
      proteinG: 11.2,
      carbsG: 62.1,
      fatG: 6.8,
    })
  })

  it('reads an Indian FSSAI table with units in the row names', () => {
    expect(parseNutritionLabel(indianTable)).toEqual({
      basis: { size: 100, unit: 'g' },
      kcal: 456,
      proteinG: 7.2,
      carbsG: 64.5,
      fatG: 18.9,
    })
  })

  it('takes the per-100 column when the per-serving column comes first', () => {
    const label = `Nutrition information
Per serving (25 g) Per 100 g
Energy 100 kcal 400 kcal
Protein 2.5 g 10 g
Carbohydrate 15 g 60 g
Fat 3 g 12 g`
    expect(parseNutritionLabel(label)).toMatchObject({
      basis: { size: 100, unit: 'g' },
      kcal: 400,
      proteinG: 10,
      carbsG: 60,
      fatG: 12,
    })
  })

  it('works out kcal from kJ when the label gives only kJ', () => {
    expect(parseNutritionLabel('Per 100g\nEnergy 2252 kJ\nProtein 6.3g')).toMatchObject({
      kcal: 538,
      proteinG: 6.3,
    })
  })

  it('reads kJ and kcal on separate rows', () => {
    const label = 'Per 100 g\nEnergy (kJ) 1046\nEnergy (kcal) 250\nFat 10 g'
    expect(parseNutritionLabel(label)).toMatchObject({ kcal: 250, fatG: 10 })
  })

  it('reads a drink per 100 ml', () => {
    expect(parseNutritionLabel('Nutrition per 100ml\nEnergy 42 kcal\nCarbohydrate 10.6 g')).toEqual(
      {
        basis: { size: 100, unit: 'ml' },
        kcal: 42,
        proteinG: null,
        carbsG: 10.6,
        fatG: null,
      },
    )
  })

  it('reads decimal commas and the usual text recognition slips', () => {
    const label =
      'Per 100 g\nEnergy 1O5 kcal\nProtein....... 2,5 g\nFat: 0,4g\nCarbohydrates 2O.1 g'
    expect(parseNutritionLabel(label)).toMatchObject({
      kcal: 105,
      proteinG: 2.5,
      fatG: 0.4,
      carbsG: 20.1,
    })
  })

  it('leaves a value it can’t read empty rather than guessing', () => {
    expect(parseNutritionLabel('Per 100 g\nProtein <0.5 g\nFat trace')).toEqual({
      basis: { size: 100, unit: 'g' },
      kcal: null,
      proteinG: null,
      carbsG: null,
      fatG: null,
    })
  })

  it('refuses per-100 g values no food can have, as a misread digit can make', () => {
    const label = 'Per 100 g\nEnergy 950 kcal\nProtein 120 g\nFat 59 g\nCarbohydrate 40 g'
    expect(parseNutritionLabel(label)).toMatchObject({ kcal: null, proteinG: null, fatG: 59 })
  })

  it('has no basis when the label names neither per 100 nor a serving weight', () => {
    expect(parseNutritionLabel('Protein 5 g').basis).toBeNull()
  })

  it('reads nothing from text that isn’t a label', () => {
    expect(parseNutritionLabel('Best before 12/2027. Store in a cool, dry place.')).toEqual({
      basis: null,
      kcal: null,
      proteinG: null,
      carbsG: null,
      fatG: null,
    })
  })

  const tenths = fc.integer({ min: 0, max: 300 }).map((n) => n / 10)
  const values = fc.record({
    kcal: fc.integer({ min: 0, max: 900 }),
    proteinG: tenths,
    carbsG: tenths,
    fatG: tenths,
  })
  type Values = { kcal: number; proteinG: number; carbsG: number; fatG: number }
  const layouts: Record<string, (v: Values) => string> = {
    eu: (v) =>
      `Typical values Per 100g\nEnergy ${Math.round(v.kcal * 4.184)}kJ/${v.kcal}kcal\nFat ${v.fatG}g\nof which saturates 0.1g\nCarbohydrate ${v.carbsG}g\nof which sugars 0.2g\nProtein ${v.proteinG}g`,
    india: (v) =>
      `Nutritional information per 100 g\nEnergy (kcal) ${v.kcal}\nProtein (g) ${v.proteinG}\nCarbohydrate (g) ${v.carbsG}\nTotal Sugars (g) 0.3\nTotal Fat (g) ${v.fatG}\nSaturated Fat (g) 0.1`,
    us: (v) =>
      `Nutrition Facts\nServing size 1 bar (40g)\nCalories ${v.kcal}\nTotal Fat ${v.fatG}g 5%\nSaturated Fat 0.1g 1%\nTotal Carbohydrate ${v.carbsG}g 9%\nTotal Sugars 0.2g\nProtein ${v.proteinG}g`,
  }

  it('reads back any values written in each layout', () => {
    fc.assert(
      fc.property(fc.constantFrom(...Object.keys(layouts)), values, (layout, v) => {
        const render = layouts[layout]
        if (!render) throw new Error(`no layout ${layout}`)
        expect(parseNutritionLabel(render(v))).toMatchObject(v)
      }),
    )
  })

  it('never throws, and only returns values the food form accepts', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 400 }), (text) => {
        const reading = parseNutritionLabel(text)
        if (reading.kcal !== null) expect(Number.isInteger(reading.kcal)).toBe(true)
        for (const value of [reading.kcal, reading.proteinG, reading.carbsG, reading.fatG]) {
          if (value !== null) expect(value).toBeGreaterThanOrEqual(0)
        }
      }),
    )
  })
})
