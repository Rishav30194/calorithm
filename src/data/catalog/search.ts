// The built-in food list (decision 0027): its shape, loading, and search.

export type CatalogFood = {
  id: string
  name: string
  aliases: string[]
  category: string
  servingSize: number
  servingUnit: string
  kcal: number
  proteinG: number
  carbsG: number
  fatG: number
  source: { dataset: string; fdcId: number }
}

// Its own chunk, loaded the first time someone searches; the service worker caches it for
// offline use like the rest of the app.
export const loadCatalog = async (): Promise<CatalogFood[]> =>
  (await import('./foods.json')).default.foods

const SEARCH_LIMIT = 20

// Built-in foods whose name or a Hindi alias contains the search, names starting with it
// first, then by name. Items already copied into your foods are left out.
export const searchCatalog = (
  foods: readonly CatalogFood[],
  query: string,
  copied: ReadonlySet<string>,
  limit = SEARCH_LIMIT,
): CatalogFood[] => {
  const needle = query.trim().toLocaleLowerCase()
  if (needle === '') return []
  const rank = (food: CatalogFood): number | null => {
    const names = [food.name, ...food.aliases].map((name) => name.toLocaleLowerCase())
    if (names.some((name) => name.startsWith(needle))) return 0
    if (names.some((name) => name.includes(needle))) return 1
    return null
  }
  return foods
    .flatMap((food) => {
      const score = copied.has(food.id) ? null : rank(food)
      return score === null ? [] : [{ food, score }]
    })
    .sort(
      (a, b) =>
        a.score - b.score ||
        a.food.name.localeCompare(b.food.name, undefined, { sensitivity: 'base' }),
    )
    .slice(0, Math.max(0, limit))
    .map(({ food }) => food)
}
