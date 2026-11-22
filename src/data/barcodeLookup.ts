import { parseBarcode } from '@/domain/barcode'

import type { LocalDb } from './db'
import { type FoodView, findFoodsByBarcode } from './foods'
import type { ProductDraft, ProductLookup } from './openFoodFacts/lookup'

export type BarcodeLookup =
  | { kind: 'saved'; barcode: string; foods: FoodView[] }
  | { kind: 'product'; barcode: string; product: ProductDraft }
  | { kind: 'not_found' | 'unreachable'; barcode: string }
  | { kind: 'invalid'; reason: 'format' | 'check_digit' }

// Your foods first, so a pack you've saved is found offline and nothing leaves the device;
// then Open Food Facts, sent only the barcode (decision 0029).
export const lookupBarcode = async (
  db: LocalDb,
  code: string,
  askOpenFoodFacts: (barcode: string) => Promise<ProductLookup>,
): Promise<BarcodeLookup> => {
  const parsed = parseBarcode(code)
  if (!parsed.ok) return { kind: 'invalid', reason: parsed.reason }
  const { barcode } = parsed
  const foods = await findFoodsByBarcode(db, barcode)
  if (foods.length > 0) return { kind: 'saved', barcode, foods }
  const remote = await askOpenFoodFacts(barcode)
  switch (remote.kind) {
    case 'found':
      return { kind: 'product', barcode, product: remote.product }
    case 'not_found':
    case 'unreachable':
      return { kind: remote.kind, barcode }
  }
}
