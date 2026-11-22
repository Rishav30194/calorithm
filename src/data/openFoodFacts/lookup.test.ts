import { describe, expect, it, vi } from 'vitest'

import found from './fixtures/product-found.json'
import notFound from './fixtures/product-not-found.json'
import { lookupProduct, parseProductResponse, productUrl } from './lookup'

const respond = (status: number, body: unknown) =>
  vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status }))

describe('productUrl', () => {
  it('asks the pinned API version for only the fields the form uses', () => {
    expect(productUrl('3017620422003')).toBe(
      'https://world.openfoodfacts.org/api/v3.4/product/3017620422003?fields=code,product_name,brands,product_quantity_unit,nutriments',
    )
  })
})

describe('parseProductResponse', () => {
  it('reads a recorded product per 100 g', () => {
    expect(parseProductResponse(200, found)).toEqual({
      kind: 'found',
      product: {
        name: 'Nutella',
        servingSize: 100,
        servingUnit: 'g',
        kcal: 539,
        proteinG: 6.3,
        carbsG: 57.5,
        fatG: 30.9,
      },
    })
  })

  it('gives a drink its values per 100 ml', () => {
    const drink = { ...found.product, product_quantity_unit: 'ml' }
    expect(parseProductResponse(200, { ...found, product: drink })).toMatchObject({
      product: { servingSize: 100, servingUnit: 'ml' },
    })
  })

  it('reads a recorded unknown code as not found', () => {
    expect(parseProductResponse(404, notFound)).toEqual({ kind: 'not_found' })
  })

  it('works out kcal from kJ when the label gives only kJ', () => {
    const product = { ...found.product, nutriments: { 'energy-kj_100g': 2252 } }
    expect(parseProductResponse(200, { ...found, product })).toMatchObject({
      kind: 'found',
      product: { kcal: 538, proteinG: null, carbsG: null, fatG: null },
    })
  })

  it('leaves out values the form would refuse, and rounds the rest', () => {
    const nutriments = {
      'energy-kcal_100g': 123.6,
      proteins_100g: 1200,
      carbohydrates_100g: -1,
      fat_100g: 0.04,
    }
    expect(
      parseProductResponse(200, { ...found, product: { ...found.product, nutriments } }),
    ).toMatchObject({
      kind: 'found',
      product: { kcal: 124, proteinG: null, carbsG: null, fatG: 0 },
    })
  })

  it('falls back to the brand for a name, and trims a long one to 100 characters', () => {
    const unnamed = { ...found.product, product_name: ' ', brands: 'Ferrero, Nutella' }
    expect(parseProductResponse(200, { ...found, product: unnamed })).toMatchObject({
      product: { name: 'Ferrero' },
    })
    const long = { ...found.product, product_name: 'x'.repeat(120) }
    expect(parseProductResponse(200, { ...found, product: long })).toMatchObject({
      product: { name: 'x'.repeat(100) },
    })
  })

  it('treats a product with no name and no values as not found', () => {
    const empty = { code: '1', product_name: '', brands: '', nutriments: {} }
    expect(parseProductResponse(200, { ...found, product: empty })).toEqual({ kind: 'not_found' })
  })

  it('treats any other status or shape as unreachable', () => {
    expect(parseProductResponse(503, found)).toEqual({ kind: 'unreachable' })
    expect(parseProductResponse(200, { status: 'success' })).toEqual({ kind: 'unreachable' })
    expect(parseProductResponse(200, 'not json')).toEqual({ kind: 'unreachable' })
  })
})

describe('lookupProduct', () => {
  it('sends only the barcode, naming the app in X-User-Agent', async () => {
    const fetchFn = respond(200, found)

    expect(await lookupProduct('3017620422003', { fetch: fetchFn })).toMatchObject({
      kind: 'found',
    })
    const [url, init] = fetchFn.mock.calls[0] ?? []
    expect(url).toBe(productUrl('3017620422003'))
    expect(new Headers(init?.headers).get('X-User-Agent')).toMatch(
      /^Calorithm\/\S+ \(https:\/\/github\.com\/Rishav30194\/calorithm\)$/,
    )
    expect(init?.credentials).toBe('omit')
  })

  it('reports no network, a timeout, and a body that isn’t JSON as unreachable', async () => {
    const offline = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'))
    expect(await lookupProduct('1', { fetch: offline })).toEqual({ kind: 'unreachable' })

    const garbled = vi.fn<typeof fetch>().mockResolvedValue(new Response('<html>', { status: 200 }))
    expect(await lookupProduct('1', { fetch: garbled })).toEqual({ kind: 'unreachable' })

    const hanging = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
        }),
    )
    expect(await lookupProduct('1', { fetch: hanging, timeoutMs: 10 })).toEqual({
      kind: 'unreachable',
    })
  })
})
