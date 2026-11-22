// Product barcodes (GTINs): EAN-8, UPC-A, EAN-13, and GTIN-14. UPC-E isn't read here: its
// check digit is computed on the expanded UPC-A code, so an 8-digit UPC-E code fails as EAN-8.

export type BarcodeResult =
  | { ok: true; barcode: string }
  | { ok: false; reason: 'format' | 'check_digit' }

// The GS1 check digit for a code's body: weights 3 and 1 alternate from the rightmost digit.
export const gtinCheckDigit = (body: string): string => {
  let sum = 0
  for (let i = 0; i < body.length; i += 1) {
    const weight = i % 2 === 0 ? 3 : 1
    sum += Number(body[body.length - 1 - i]) * weight
  }
  return String((10 - (sum % 10)) % 10)
}

// One stored form per product, so a UPC-A scan finds a food saved from its EAN-13 form: a
// 12-digit code gets a leading zero, and a 14-digit code with a leading zero loses it.
const canonical = (code: string): string => {
  if (code.length === 12) return `0${code}`
  if (code.length === 14 && code.startsWith('0')) return code.slice(1)
  return code
}

export const parseBarcode = (input: string): BarcodeResult => {
  const code = input.replace(/[\s-]/g, '')
  if (!/^[0-9]{8}$|^[0-9]{12,14}$/.test(code)) return { ok: false, reason: 'format' }
  if (gtinCheckDigit(code.slice(0, -1)) !== code.slice(-1)) {
    return { ok: false, reason: 'check_digit' }
  }
  return { ok: true, barcode: canonical(code) }
}
