import { describe, expect, it } from 'vitest'

import catalog from './foods.json'

const { foods, source } = catalog

describe('the built-in food list (decision 0027)', () => {
  it('has between 150 and 250 foods, each with a unique id and name', () => {
    expect(foods.length).toBeGreaterThanOrEqual(150)
    expect(foods.length).toBeLessThanOrEqual(250)
    expect(new Set(foods.map((food) => food.id)).size).toBe(foods.length)
    expect(new Set(foods.map((food) => food.name.toLowerCase())).size).toBe(foods.length)
  })

  it('credits USDA FoodData Central, which asks for it', () => {
    expect(source.name).toBe('USDA FoodData Central')
    expect(source.license).toMatch(/CC0/)
  })

  it.each(foods)('$name fits a food the app can save', (food) => {
    // The same limits as the food form and the foods table.
    expect(food.name.length).toBeGreaterThan(0)
    expect(food.name.length).toBeLessThanOrEqual(100)
    expect(food.servingUnit.length).toBeGreaterThan(0)
    expect(food.servingUnit.length).toBeLessThanOrEqual(20)
    expect(food.servingSize).toBeGreaterThan(0)
    expect(Number.isInteger(food.kcal)).toBe(true)
    for (const grams of [food.proteinG, food.carbsG, food.fatG]) {
      expect(grams).toBeGreaterThanOrEqual(0)
      expect(grams).toBeLessThanOrEqual(1000)
      expect(Math.round(grams * 10)).toBeCloseTo(grams * 10, 6)
    }
    expect(food.kcal).toBeLessThanOrEqual(10000)
    expect(food.source.fdcId).toBeGreaterThan(0)
    expect(['SR Legacy', 'FNDDS 2021-2023']).toContain(food.source.dataset)
  })

  // USDA computes energy with food-specific factors, which count fibre and organic acids for
  // less, so fruit and vegetables come in under 4 × protein + 4 × carbs + 9 × fat. A value
  // above it, or far below it, means a scaling or unit mistake.
  it.each(foods)('$name has energy that fits its protein, carbs, and fat', (food) => {
    const general = 4 * food.proteinG + 4 * food.carbsG + 9 * food.fatG
    expect(food.kcal).toBeLessThanOrEqual(general * 1.1 + 5)
    expect(food.kcal).toBeGreaterThanOrEqual(general * 0.45)
  })

  it('has no beef or pork', () => {
    const text = foods.map((food) => `${food.name} ${food.aliases.join(' ')}`).join(' ')
    expect(text).not.toMatch(/\b(beef|pork|bacon|ham|veal)\b/i)
  })
})
