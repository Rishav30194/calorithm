// Builds src/data/catalog/foods.json, the built-in food list (phase 10, decision 0027), from
// scripts/catalog/items.json and USDA FoodData Central's CSV downloads. The downloads aren't
// committed; get them from https://fdc.nal.usda.gov/download-datasets and run:
//
//   node scripts/build-catalog.mjs SR_LEGACY_DIR FNDDS_DIR
//
// SR_LEGACY_DIR is the unzipped "SR Legacy" CSV folder (2018-04) and FNDDS_DIR the unzipped
// "FNDDS" CSV folder (2024-10-31). Each item names a USDA food by id; the script checks the
// description still matches, so a changed dataset fails loudly instead of shipping new values.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const [srDir, fnddsDir] = process.argv.slice(2)
if (!srDir || !fnddsDir) {
  console.error('usage: node scripts/build-catalog.mjs SR_LEGACY_DIR FNDDS_DIR')
  process.exit(1)
}

// RFC 4180 CSV: quoted fields, doubled quotes inside them.
const parseCsv = (text) => {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (char === '"') {
        quoted = false
      } else {
        field += char
      }
    } else if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field.replace(/\r$/, ''))
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }
  if (field !== '' || row.length > 0) rows.push([...row, field])
  const [header = [], ...body] = rows
  return body.map((cells) => Object.fromEntries(header.map((name, index) => [name, cells[index]])))
}

const read = (dir, file) => parseCsv(readFileSync(`${dir}/${file}`, 'utf8'))

// SR Legacy keys nutrients by id, FNDDS by the older nutrient number.
const NUTRIENTS = {
  kcal: ['1008', '208'],
  protein: ['1003', '203'],
  carbs: ['1005', '205'],
  fat: ['1004', '204'],
}

const load = (dir) => {
  const descriptions = new Map(read(dir, 'food.csv').map((r) => [r.fdc_id, r.description]))
  const wanted = new Map(
    Object.entries(NUTRIENTS).flatMap(([key, ids]) => ids.map((id) => [id, key])),
  )
  const nutrients = new Map()
  for (const r of read(dir, 'food_nutrient.csv')) {
    const key = wanted.get(r.nutrient_id)
    // A blank amount is missing, not zero; the item then fails the completeness check.
    if (!key || r.amount.trim() === '' || !Number.isFinite(Number(r.amount))) continue
    const values = nutrients.get(r.fdc_id) ?? {}
    values[key] = Number(r.amount)
    nutrients.set(r.fdc_id, values)
  }
  const portions = new Map()
  for (const r of read(dir, 'food_portion.csv')) {
    const label = (r.portion_description || `${r.amount} ${r.modifier}`).trim()
    const list = portions.get(r.fdc_id) ?? []
    list.push({ label, grams: Number(r.gram_weight) })
    portions.set(r.fdc_id, list)
  }
  return { descriptions, nutrients, portions }
}

const datasets = { 'SR Legacy': load(srDir), 'FNDDS 2021-2023': load(fnddsDir) }

// Half away from zero, like the app's roundTo.
const round = (value, decimals) => {
  const factor = 10 ** decimals
  return (
    (Math.sign(value) * Math.round(Number((Math.abs(value) * factor).toPrecision(12)))) / factor + 0
  )
}

const { items } = JSON.parse(readFileSync(`${root}scripts/catalog/items.json`, 'utf8'))
const problems = []
const foods = items.flatMap((item) => {
  const data = datasets[item.dataset]
  const id = String(item.fdcId)
  const description = data?.descriptions.get(id)
  if (description !== item.usdaDescription) {
    problems.push(`${item.id}: USDA ${id} is "${description}", expected "${item.usdaDescription}"`)
    return []
  }
  const per100 = data.nutrients.get(id) ?? {}
  if (Object.keys(NUTRIENTS).some((key) => typeof per100[key] !== 'number')) {
    problems.push(`${item.id}: USDA ${id} lacks one of kcal, protein, carbs, or fat`)
    return []
  }
  let servingSize = 100
  let servingUnit = 'g'
  let grams = 100
  if (item.portion) {
    // "1 cup" also starts "1 cup, chopped": every match must weigh the same, or it's ambiguous.
    // portionGrams picks one weight when USDA lists several for the same label.
    const matches = (data.portions.get(id) ?? []).filter(
      (p) =>
        p.label.toLowerCase().startsWith(item.portion.toLowerCase()) &&
        (item.portionGrams === undefined || p.grams === item.portionGrams),
    )
    const [portion] = matches
    if (!portion) {
      problems.push(`${item.id}: no USDA portion starting "${item.portion}"`)
      return []
    }
    if (matches.some((p) => p.grams !== portion.grams)) {
      const labels = matches.map((p) => `${p.label} = ${p.grams} g`).join('; ')
      problems.push(
        `${item.id}: "${item.portion}" matches portions of different weights: ${labels}`,
      )
      return []
    }
    // "2 tbsp" is a serving of 2 tbsp; "1 medium" of 1 medium. Fractions aren't read.
    const parts = item.portion.match(/^(\d+(?:\.\d+)?) (.+)$/)
    if (!parts?.[1] || !parts[2]) {
      problems.push(`${item.id}: portion "${item.portion}" must start with a decimal amount`)
      return []
    }
    grams = portion.grams
    const named = parts[2]
    const weight = `(${round(grams, 1)} g)`
    // The unit column holds 20 characters: shorten "tsp, crumbled" to "tsp" before the grams.
    const label = [`${named} ${weight}`, `${named.split(',')[0]} ${weight}`].find(
      (text) => text.length <= 20,
    )
    if (!label) {
      problems.push(`${item.id}: no serving unit of 20 characters or fewer for "${named}"`)
      return []
    }
    servingSize = Number(parts[1])
    servingUnit = label
  }
  const scale = grams / 100
  return [
    {
      id: item.id,
      name: item.name,
      aliases: item.aliases,
      category: item.category,
      servingSize,
      servingUnit,
      kcal: round(per100.kcal * scale, 0),
      proteinG: round(per100.protein * scale, 1),
      carbsG: round(per100.carbs * scale, 1),
      fatG: round(per100.fat * scale, 1),
      source: { dataset: item.dataset, fdcId: item.fdcId },
    },
  ]
})

if (problems.length > 0) {
  console.error(problems.join('\n'))
  process.exit(1)
}

const catalog = {
  source: {
    name: 'USDA FoodData Central',
    url: 'https://fdc.nal.usda.gov/',
    license: 'CC0 1.0 (public domain)',
    citation:
      'U.S. Department of Agriculture, Agricultural Research Service. FoodData Central. fdc.nal.usda.gov.',
    datasets: ['SR Legacy (2018-04)', 'FNDDS 2021-2023 (2024-10-31)'],
  },
  foods,
}
writeFileSync(`${root}src/data/catalog/foods.json`, `${JSON.stringify(catalog, null, 2)}\n`)
console.log(`wrote ${foods.length} foods to src/data/catalog/foods.json`)
