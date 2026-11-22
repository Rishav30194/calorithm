// Reads a nutrition facts label's text, pasted or from text recognition, into what the food
// form needs (decision 0030). A value it can't read with confidence is null, for the user to
// type; it never guesses.

export type LabelBasis = { size: number; unit: 'g' | 'ml' }

export type LabelReading = {
  // What the values are for: 100 g or 100 ml, or the label's serving weight. Null when the
  // label names neither.
  basis: LabelBasis | null
  kcal: number | null
  proteinG: number | null
  carbsG: number | null
  fatG: number | null
}

const KJ_PER_KCAL = 4.184
// Pure fat has 9 kcal per gram, so no food has more per 100 g.
const MAX_KCAL_PER_100 = 900
// The food form's limits.
const MAX_KCAL = 10_000
const MAX_GRAMS = 1_000

type Amount = { value: number | null; unit: string }

// Text recognition reads a 0 as the letter O beside other digits. An O after a digit is
// changed only before a digit, a decimal mark, a unit, or the line's end, so "1oz" stays.
const fixDigits = (line: string): string =>
  line.replace(/(?<=\d)[oO](?=[\d.,]|\s*(?:g|mg|ml|kcal|kj)\b|$)|[oO](?=[.,]?\d)/g, '0')

const toNumber = (text: string, thousands: boolean): number => {
  // In an energy value "1,569" or "1.569" is thousands; elsewhere a comma is a decimal mark.
  if (thousands && /^[1-9]\d?[.,]\d{3}$/.test(text)) return Number(text.replace(/[.,]/, ''))
  return Number(text.replace(',', '.'))
}

// Every number in a line, with the unit after it. A number after "<" counts as unreadable.
const amountsIn = (line: string, thousands: boolean): Amount[] =>
  [...line.matchAll(/(<\s*)?(\d+(?:[.,]\d+)?)\s*(kcal|kj|cal|mg|ml|g|%)?/gi)].map((match) => ({
    value: match[1] ? null : toNumber(match[2] ?? '', thousands),
    unit: (match[3] ?? '').toLowerCase(),
  }))

// A row is a nutrient's when its name comes before its first number.
const nameOf = (line: string): string => line.split(/[<\d]/)[0]?.toLowerCase() ?? ''

const isEnergy = (name: string) =>
  /energy|calories|kcal|\bkj\b/.test(name) && !/from fat/.test(name)
const isProtein = (name: string) => /protein/.test(name)
const isCarbs = (name: string) =>
  /carbohydrate|\bcarbs?\b/.test(name) && !/sugar|fib|starch|polyol|of which/.test(name)
const isFat = (name: string) =>
  /\bfats?\b/.test(name) && !/saturat|trans|mono|poly|of which|from fat|cholesterol/.test(name)

// The header naming the per-100 column: how many "per …" columns it names, and which one is
// per 100 g or 100 ml. A "Serving size 100 g" line is a serving, not a header.
const per100Header = (lines: string[]) => {
  for (const [index, line] of lines.entries()) {
    const lower = line.toLowerCase()
    if (!/100\s*(g|ml)\b/.test(lower) || /serving size/.test(lower)) continue
    const perColumns = lower.split(/\bper\b/).slice(1)
    const columns = perColumns.length > 0 ? perColumns : [lower]
    const column = columns.findIndex(
      (text) => /^\W*100\s*(g|ml)\b/.test(text) || columns.length === 1,
    )
    if (column < 0) continue
    return {
      index,
      unit: /100\s*ml\b/.test(lower) ? ('ml' as const) : ('g' as const),
      columns: columns.length,
      column,
    }
  }
  return null
}

const servingBasis = (text: string): LabelBasis | null => {
  const match =
    /serving size[^\n]*?\(\s*(\d+(?:[.,]\d+)?)\s*(g|ml)\s*\)/i.exec(text) ??
    /serving size\s*:?\s*(\d+(?:[.,]\d+)?)\s*(g|ml)\b/i.exec(text)
  if (!match) return null
  const size = toNumber(match[1] ?? '', false)
  return size > 0 ? { size, unit: match[2]?.toLowerCase() === 'ml' ? 'ml' : 'g' } : null
}

// The chosen column's value; null when a row with several columns doesn't have it.
const pick = (amounts: Amount[], column: number, columns: number): number | null => {
  if (amounts.length === 0) return null
  if (columns > 1 && amounts.length < columns) return null
  return amounts[columns > 1 ? column : 0]?.value ?? null
}

// The first row for the nutrient that gives a value; a claim such as "Low fat" gives none.
const gramsRow = (
  lines: string[],
  matches: (name: string) => boolean,
  column: number,
  columns: number,
): number | null => {
  for (const line of lines) {
    const name = nameOf(line)
    if (!matches(name) || !/\d/.test(line)) continue
    const amounts = amountsIn(line.slice(name.length), false).filter(
      (amount) => amount.unit === '' || amount.unit === 'g',
    )
    const value = pick(amounts, column, columns)
    if (value !== null) return value
  }
  return null
}

const energy = (lines: string[], column: number, columns: number): number | null => {
  let kj: number | null = null
  for (const line of lines) {
    const name = nameOf(line)
    if (!isEnergy(name) || !/\d/.test(line)) continue
    const lower = line.toLowerCase()
    const amounts = amountsIn(line.slice(name.length), true)
    const named = (units: string[]) => amounts.filter((amount) => units.includes(amount.unit))
    const bare = amounts.filter((amount) => amount.unit === '')
    const saysKcal = /kcal|calorie/.test(lower)
    const saysKj = /kj\b/.test(lower)
    const kcalAmounts =
      named(['kcal', 'cal']).length > 0 ? named(['kcal', 'cal']) : saysKcal && !saysKj ? bare : []
    const kcal = pick(kcalAmounts, column, columns)
    if (kcal !== null) return kcal
    const kjAmounts = named(['kj']).length > 0 ? named(['kj']) : saysKj && !saysKcal ? bare : []
    kj ??= pick(kjAmounts, column, columns)
  }
  return kj === null ? null : kj / KJ_PER_KCAL
}

const within = (value: number | null, max: number): number | null =>
  value !== null && Number.isFinite(value) && value >= 0 && value <= max ? value : null

const hundredths = (value: number | null): number | null =>
  value === null ? null : Math.round(value * 100) / 100

// A name on its own line, with its values on the lines after it (as text recognition can
// read a table), becomes one row.
const joinRows = (lines: string[]): string[] => {
  const rows: string[] = []
  // Whether the last row is a name still taking values from the lines that follow.
  let open = false
  for (const line of lines) {
    const last = rows.length - 1
    if (open && last >= 0 && nameOf(line).trim() === '') {
      rows[last] = `${rows[last]} ${line}`
      continue
    }
    rows.push(line)
    open = !/[\d<]/.test(line) && nameOf(line).trim() !== ''
  }
  return rows
}

// Where the table starts, so a claim above it ("High protein 20g") isn't read as a row.
const TITLE = /nutrition facts|nutrition(al)? information|typical values/i

export const parseNutritionLabel = (text: string): LabelReading => {
  const all = joinRows(
    text
      .split(/\r?\n/)
      .map((line) => fixDigits(line.trim()))
      .filter((line) => line !== ''),
  )
  const header = per100Header(all)
  const title = all.findIndex((line) => TITLE.test(line))
  const starts = [header?.index ?? -1, title].filter((index) => index >= 0)
  const lines = all.slice(starts.length > 0 ? Math.min(...starts) : 0)
  const basis: LabelBasis | null = header ? { size: 100, unit: header.unit } : servingBasis(text)
  const column = header?.column ?? 0
  const columns = header?.columns ?? 1

  const per100 = basis?.size === 100
  const gramsMax = per100 ? 100 : Math.min(basis?.size ?? MAX_GRAMS, MAX_GRAMS)
  const grams = (matches: (name: string) => boolean) =>
    hundredths(within(gramsRow(lines, matches, column, columns), gramsMax))
  const kcal = within(energy(lines, column, columns), per100 ? MAX_KCAL_PER_100 : MAX_KCAL)

  return {
    basis,
    kcal: kcal === null ? null : Math.round(kcal),
    proteinG: grams(isProtein),
    carbsG: grams(isCarbs),
    fatG: grams(isFat),
  }
}
