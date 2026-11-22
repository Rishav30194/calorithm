import { describe, expect, it } from 'vitest'

import catalog from './foods.json'
import { type CatalogFood, searchCatalog } from './search'

const foods: CatalogFood[] = catalog.foods
const names = (found: CatalogFood[]) => found.map((food) => food.name)

describe('searchCatalog (decision 0027)', () => {
  it('finds a food by its English name or a Hindi alias, ignoring case', () => {
    expect(names(searchCatalog(foods, 'Turmeric', new Set()))).toContain('Turmeric')
    expect(names(searchCatalog(foods, 'haldi', new Set()))).toEqual(['Turmeric'])
    expect(names(searchCatalog(foods, 'DAHI', new Set()))).toEqual(
      expect.arrayContaining(['Curd', 'Curd, low fat']),
    )
  })

  // Phase 10 criterion: these show before you have created any food.
  it('finds paneer, dal, and roti', () => {
    for (const [query, name] of [
      ['paneer', 'Paneer'],
      ['dal', 'Dal'],
      ['roti', 'Roti'],
    ] as const) {
      expect(names(searchCatalog(foods, query, new Set()))).toContain(name)
    }
  })

  it('lists names that start with the search before names that only contain it', () => {
    const found = names(searchCatalog(foods, 'rice', new Set()))
    expect(found.indexOf('Rice, white, cooked')).toBeLessThan(found.indexOf('Puffed rice'))
  })

  // Phase 14: "hing" used to find prawns through their alias "jhinga".
  it('matches the start of a word, not the middle of one', () => {
    expect(names(searchCatalog(foods, 'hing', new Set()))).not.toContain('Prawns, cooked')
    expect(names(searchCatalog(foods, 'jhinga', new Set()))).toContain('Prawns, cooked')
    expect(names(searchCatalog(foods, 'chili powder', new Set()))).toContain('Red chili powder')
    expect(names(searchCatalog(foods, 'meric', new Set()))).toEqual([])
  })

  // Phase 14: spices USDA doesn't have, from CoFID or marked as estimates.
  it('finds the spices added from CoFID and as estimates, by their common names', () => {
    for (const [query, name] of [
      ['garam masala', 'Garam masala'],
      ['kadi patta', 'Curry leaves'],
      ['kala namak', 'Black salt'],
      ['amchur', 'Amchur (estimate)'],
      ['ajwain', 'Ajwain (estimate)'],
      ['kalonji', 'Kalonji (estimate)'],
      ['chaat masala', 'Chaat masala (estimate)'],
    ] as const) {
      expect(names(searchCatalog(foods, query, new Set()))).toContain(name)
    }
    // No open source gives asafoetida's energy and carbs, so it isn't offered.
    expect(names(searchCatalog(foods, 'hing', new Set()))).toEqual([])
  })

  it('leaves out items already copied into your foods', () => {
    expect(names(searchCatalog(foods, 'haldi', new Set(['turmeric'])))).toEqual([])
  })

  it('finds nothing for an empty or blank search, and at most the limit', () => {
    expect(searchCatalog(foods, '  ', new Set())).toEqual([])
    expect(searchCatalog(foods, 'a', new Set(), 5)).toHaveLength(5)
  })
})
