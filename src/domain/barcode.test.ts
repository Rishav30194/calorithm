import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { gtinCheckDigit, parseBarcode, upcEToUpcA } from './barcode'

// A code's body with its check digit appended.
const withCheck = (body: string): string => `${body}${gtinCheckDigit(body)}`

const digits = (length: number) =>
  fc
    .array(fc.integer({ min: 0, max: 9 }), { minLength: length, maxLength: length })
    .map((d) => d.join(''))

const validCode = fc
  .constantFrom(8, 12, 13, 14)
  .chain((length) => digits(length - 1).map(withCheck))

describe('gtinCheckDigit', () => {
  it('matches published codes', () => {
    // EAN-13, UPC-A, and EAN-8 examples from GS1's check digit calculator.
    expect(gtinCheckDigit('629104150021')).toBe('3')
    expect(gtinCheckDigit('03600029145')).toBe('2')
    expect(gtinCheckDigit('9638507')).toBe('4')
  })
})

describe('parseBarcode', () => {
  it('accepts EAN-13 and EAN-8 codes as they are', () => {
    expect(parseBarcode('6291041500213')).toEqual({ ok: true, barcode: '6291041500213' })
    expect(parseBarcode('96385074')).toEqual({ ok: true, barcode: '96385074' })
  })

  it('stores a 12-digit UPC-A code as its EAN-13 form, so both scans find the same food', () => {
    expect(parseBarcode('036000291452')).toEqual({ ok: true, barcode: '0036000291452' })
  })

  it('drops the leading zero of a 14-digit code that is an EAN-13 code', () => {
    expect(parseBarcode('06291041500213')).toEqual({ ok: true, barcode: '6291041500213' })
  })

  it('stores an EAN-8 code padded to 12, 13, or 14 digits as its 8 digits', () => {
    for (const padded of ['000096385074', '0000096385074', '00000096385074']) {
      expect(parseBarcode(padded)).toEqual({ ok: true, barcode: '96385074' })
    }
  })

  // 01234505 fails as EAN-8, so it's read as the UPC-E code a scan would expand.
  it('reads a typed UPC-E code as its expanded form when it isn’t a valid EAN-8 code', () => {
    expect(parseBarcode('01234505')).toEqual({ ok: true, barcode: '0012000003455' })
    expect(parseBarcode('01234504')).toEqual({ ok: false, reason: 'check_digit' })
  })

  it('ignores spaces and hyphens around and between digits', () => {
    expect(parseBarcode(' 629 1041-500213 ')).toEqual({ ok: true, barcode: '6291041500213' })
  })

  it('refuses other characters and other lengths', () => {
    expect(parseBarcode('')).toEqual({ ok: false, reason: 'format' })
    expect(parseBarcode('62910415002a3')).toEqual({ ok: false, reason: 'format' })
    expect(parseBarcode('1234567')).toEqual({ ok: false, reason: 'format' })
    expect(parseBarcode('1234567890')).toEqual({ ok: false, reason: 'format' })
    expect(parseBarcode('123456789012345')).toEqual({ ok: false, reason: 'format' })
    // Non-Latin digits are refused, as the database's check would refuse them.
    expect(parseBarcode('٦٢٩١٠٤١٥٠٠٢١٣')).toEqual({ ok: false, reason: 'format' })
  })

  it('refuses a code whose check digit is wrong', () => {
    expect(parseBarcode('6291041500214')).toEqual({ ok: false, reason: 'check_digit' })
  })

  it('accepts every code with a correct check digit, as 8, 13, or 14 digits', () => {
    fc.assert(
      fc.property(validCode, (code) => {
        const result = parseBarcode(code)
        expect(result.ok).toBe(true)
        if (result.ok) expect([8, 13, 14]).toContain(result.barcode.length)
      }),
    )
  })

  it('gives the same result for a code parsed again', () => {
    fc.assert(
      fc.property(validCode, (code) => {
        const first = parseBarcode(code)
        if (!first.ok) return
        expect(parseBarcode(first.barcode)).toEqual(first)
      }),
    )
  })

  it('refuses any code with one digit changed', () => {
    fc.assert(
      fc.property(validCode, fc.nat(), fc.integer({ min: 1, max: 9 }), (code, at, shift) => {
        const index = at % code.length
        const changed = (Number(code[index]) + shift) % 10
        const typo = `${code.slice(0, index)}${changed}${code.slice(index + 1)}`
        // An 8-digit typo starting 0 or 1 can be a valid UPC-E code instead.
        fc.pre(!(typo.length === 8 && /^[01]/.test(typo)))
        expect(parseBarcode(typo)).toEqual({ ok: false, reason: 'check_digit' })
      }),
    )
  })
})

describe('upcEToUpcA', () => {
  it('expands each of the four UPC-E patterns', () => {
    // The last of the six middle digits picks the pattern.
    expect(upcEToUpcA('01234505')).toBe('012000003455')
    expect(upcEToUpcA('01234531')).toBe('012300000451')
    expect(upcEToUpcA('01234548')).toBe('012340000058')
    expect(upcEToUpcA('01234565')).toBe('012345000065')
  })

  it('refuses codes that aren’t UPC-E', () => {
    expect(upcEToUpcA('21234565')).toBeNull()
    expect(upcEToUpcA('0123456')).toBeNull()
    expect(upcEToUpcA('0123456a')).toBeNull()
  })

  it('keeps the number system and check digit, so a valid UPC-E code parses', () => {
    fc.assert(
      fc.property(fc.constantFrom('0', '1'), digits(6), (system, middle) => {
        const expanded = upcEToUpcA(`${system}${middle}0`)
        if (expanded === null) throw new Error('not expanded')
        const body = expanded.slice(0, 11)
        const code = upcEToUpcA(`${system}${middle}${gtinCheckDigit(body)}`)
        expect(code === null ? null : parseBarcode(code).ok).toBe(true)
        expect(code?.[0]).toBe(system)
      }),
    )
  })
})
