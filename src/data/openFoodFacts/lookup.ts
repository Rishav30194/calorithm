import { z } from 'zod/mini'

// Open Food Facts (decision 0029): only the barcode leaves the device. v3.4 is pinned because
// v3.5 and later replace `nutriments` with a shape that mixes label values and estimates.
const API = 'https://world.openfoodfacts.org/api/v3.4/product'
const FIELDS = 'code,product_name,brands,product_quantity_unit,nutriments'
// Browsers can't set User-Agent, which Open Food Facts asks apps to use; its API accepts this
// header from any origin instead (checked 2026-11-22, not documented by them).
const APP_ID = `Calorithm/${__APP_VERSION__} (https://github.com/Rishav30194/calorithm)`
const TIMEOUT_MS = 8000

// Stored as a food's catalog_id when its values came from Open Food Facts, so the food keeps
// the ODbL credit (decision 0029). No built-in item has this id.
export const OPEN_FOOD_FACTS_SOURCE = 'openfoodfacts'
export const OPEN_FOOD_FACTS_URL = 'https://world.openfoodfacts.org'
export const ODBL_URL = 'https://opendatacommons.org/licenses/odbl/1-0/'

// What the food form gets filled with. Values the label lacks, or the form would refuse, are
// null and left for the user to enter.
export type ProductDraft = {
  name: string
  servingSize: number
  servingUnit: string
  kcal: number | null
  proteinG: number | null
  carbsG: number | null
  fatG: number | null
}

export type ProductLookup =
  | { kind: 'found'; product: ProductDraft }
  | { kind: 'not_found' }
  // No network, a timeout, the service refusing or failing, or a reply in an unknown shape.
  | { kind: 'unreachable' }

export const productUrl = (barcode: string): string =>
  `${API}/${encodeURIComponent(barcode)}?fields=${FIELDS}`

const foundSchema = z.object({
  status: z.literal('success'),
  product: z.object({
    product_name: z.optional(z.string()),
    brands: z.optional(z.string()),
    product_quantity_unit: z.optional(z.string()),
    nutriments: z.optional(z.record(z.string(), z.unknown())),
  }),
})

const notFoundSchema = z.object({ result: z.object({ id: z.literal('product_not_found') }) })

const MAX_NAME = 100
const KJ_PER_KCAL = 4.184

const numberIn = (record: Record<string, unknown>, key: string): number | null => {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

// The form's limits: whole kcal up to 10000, and grams up to 1000.
const inRange = (value: number | null, max: number): number | null =>
  value !== null && value >= 0 && value <= max ? value : null

const tenths = (value: number | null): number | null =>
  value === null ? null : Math.round(value * 10) / 10

const draftOf = (product: z.infer<typeof foundSchema>['product']): ProductDraft | null => {
  const nutriments = product.nutriments ?? {}
  const kj = numberIn(nutriments, 'energy-kj_100g')
  const kcal = numberIn(nutriments, 'energy-kcal_100g') ?? (kj === null ? null : kj / KJ_PER_KCAL)
  const grams = (key: string) => tenths(inRange(numberIn(nutriments, key), 1000))
  const brand = product.brands?.split(',')[0]?.trim() ?? ''
  const name = (product.product_name?.trim() || brand).slice(0, MAX_NAME).trim()
  const draft: ProductDraft = {
    name,
    // Open Food Facts keys its values per 100 g, or per 100 ml for a pack sold by volume.
    servingSize: 100,
    servingUnit: product.product_quantity_unit === 'ml' ? 'ml' : 'g',
    kcal: inRange(kcal === null ? null : Math.round(kcal), 10_000),
    proteinG: grams('proteins_100g'),
    carbsG: grams('carbohydrates_100g'),
    fatG: grams('fat_100g'),
  }
  const empty =
    name === '' &&
    draft.kcal === null &&
    draft.proteinG === null &&
    draft.carbsG === null &&
    draft.fatG === null
  return empty ? null : draft
}

export const parseProductResponse = (status: number, body: unknown): ProductLookup => {
  if (status === 200) {
    const parsed = foundSchema.safeParse(body)
    if (!parsed.success) return { kind: 'unreachable' }
    const draft = draftOf(parsed.data.product)
    return draft ? { kind: 'found', product: draft } : { kind: 'not_found' }
  }
  if (status === 404 && notFoundSchema.safeParse(body).success) return { kind: 'not_found' }
  return { kind: 'unreachable' }
}

export const lookupProduct = async (
  barcode: string,
  options: { fetch?: typeof fetch; timeoutMs?: number } = {},
): Promise<ProductLookup> => {
  const fetchFn = options.fetch ?? fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? TIMEOUT_MS)
  try {
    const response = await fetchFn(productUrl(barcode), {
      headers: { 'X-User-Agent': APP_ID },
      credentials: 'omit',
      signal: controller.signal,
    })
    const body: unknown = await response.json()
    return parseProductResponse(response.status, body)
  } catch {
    return { kind: 'unreachable' }
  } finally {
    clearTimeout(timer)
  }
}
