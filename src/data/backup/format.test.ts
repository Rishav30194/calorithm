import fc from 'fast-check'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { closeAll, manualClock, openDb, userId } from '../sync/testing/fixtures'
import { buildExport } from './backup'
import { type ExportFile, MAX_EXPORT_CHARS, parseExport } from './format'
import { seedSample } from './testing'

const context = { now: new Date('2026-11-21T12:00:00.000Z'), today: '2026-11-21' }
let sample: ExportFile

beforeAll(async () => {
  const db = openDb('calorithm-test-format')
  await seedSample(db, manualClock().clock, userId)
  sample = await buildExport(db, userId, new Date('2026-11-21T09:00:00.000Z'), '0.1.0')
  await closeAll()
})

afterEach(closeAll)

// A copy of the sample with one change made to it.
const edited = (change: (file: Record<string, unknown> & ExportFile) => void): string => {
  const copy = structuredClone(sample) as Record<string, unknown> & ExportFile
  change(copy)
  return JSON.stringify(copy)
}

const rows = (file: ExportFile, table: keyof ExportFile['tables']): Record<string, unknown>[] =>
  file.tables[table] as unknown as Record<string, unknown>[]

const first = (file: ExportFile, table: keyof ExportFile['tables']): Record<string, unknown> => {
  const row = rows(file, table)[0]
  if (!row) throw new Error(`the sample has no ${table} row`)
  return row
}

describe('parseExport', () => {
  it('accepts an export the app built', () => {
    const result = parseExport(JSON.stringify(sample), context)
    expect(result).toEqual({ ok: true, file: sample })
  })

  it('accepts timestamps in the format Postgres returns', () => {
    const text = edited((file) => {
      first(file, 'foods').client_updated_at = '2026-11-20 10:00:00.123456+00'
    })
    expect(parseExport(text, context).ok).toBe(true)
  })

  it('accepts a deleted food, which live rows may still use', () => {
    const text = edited((file) => {
      first(file, 'foods').deleted_at = '2026-11-20T10:00:00.000Z'
    })
    expect(parseExport(text, context).ok).toBe(true)
  })

  it('checks the birth date against the earlier of the local and UTC days', () => {
    // 12:00 UTC on the 21st is already the 22nd in UTC+13.
    const ahead = { now: context.now, today: '2026-11-22' }
    const born = (date: string) =>
      edited((file) => {
        first(file, 'profile').birth_date = date
      })
    expect(parseExport(born('2026-11-21'), ahead).ok).toBe(true)
    expect(parseExport(born('2026-11-22'), ahead)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('refuses a file over the size limit before parsing it', () => {
    expect(parseExport(' '.repeat(MAX_EXPORT_CHARS + 1), context)).toEqual({
      ok: false,
      reason: 'too_large',
    })
  })

  it('refuses text that is not JSON', () => {
    expect(parseExport('{"format": "calorithm-export",', context)).toEqual({
      ok: false,
      reason: 'not_json',
    })
  })

  it.each([
    ['another format', () => edited((file) => Object.assign(file, { format: 'other' }))],
    ['no version', () => edited((file) => Object.assign(file, { version: undefined }))],
    ['version 0', () => edited((file) => Object.assign(file, { version: 0 }))],
    ['an array', () => '[]'],
    ['a number', () => '42'],
  ])('refuses a file that is not an export: %s', (_case, text) => {
    expect(parseExport(text(), context)).toEqual({ ok: false, reason: 'not_export' })
  })

  it('writes format version 2, which carries carbs and fat', () => {
    expect(sample.version).toBe(2)
  })

  it('refuses a file from a newer format version', () => {
    const text = edited((file) => Object.assign(file, { version: 3, tables: 'anything' }))
    expect(parseExport(text, context)).toEqual({ ok: false, reason: 'newer_version' })
  })

  it('accepts a format version 1 file, with carbs and fat not set', () => {
    const text = edited((file) => {
      Object.assign(file, { version: 1 })
      for (const table of ['foods', 'log_entries'] as const) {
        for (const row of rows(file, table)) {
          row.schema_version = 1
          delete row.carbs_g
          delete row.fat_g
          delete row.carbs_g_per_serving
          delete row.fat_g_per_serving
        }
      }
    })

    const result = parseExport(text, context)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.file.tables.foods.length).toBeGreaterThan(0)
    expect(result.file.tables.log_entries.length).toBeGreaterThan(0)
    for (const food of result.file.tables.foods) {
      expect(food).toMatchObject({ schema_version: 1, carbs_g: null, fat_g: null })
    }
    for (const entry of result.file.tables.log_entries) {
      expect(entry).toMatchObject({ schema_version: 1, carbs_g: null, carbs_g_per_serving: null })
    }
  })

  it('refuses a row written in a newer schema version', () => {
    const text = edited((file) => {
      first(file, 'weights').schema_version = 2
    })
    expect(parseExport(text, context)).toEqual({ ok: false, reason: 'newer_version' })
  })

  const invalid: [string, (file: Record<string, unknown> & ExportFile) => void][] = [
    ['a missing table', (file) => Reflect.deleteProperty(file.tables, 'checkins')],
    ['a user id that is not a UUID', (file) => Object.assign(file, { user_id: 'me' })],
    ['a bad export time', (file) => Object.assign(file, { exported_at: 'yesterday' })],
    ['a row missing a column', (file) => Reflect.deleteProperty(first(file, 'foods'), 'kcal')],
    [
      'a row of another user',
      (file) => {
        first(file, 'foods').user_id = 'b0000000-0000-4000-8000-000000000002'
      },
    ],
    [
      'a deleted row',
      (file) => {
        first(file, 'weights').deleted_at = '2026-11-20T10:00:00.000Z'
      },
    ],
    [
      'a row on an older schema version',
      (file) => {
        first(file, 'foods').schema_version = 0
      },
    ],
    [
      'an id that is not a UUID',
      (file) => {
        first(file, 'foods').id = 'oats'
      },
    ],
    [
      'a bad edit time',
      (file) => {
        first(file, 'foods').client_updated_at = 'now'
      },
    ],
    [
      'the same id twice',
      (file) => {
        file.tables.foods.push(structuredClone(file.tables.foods[0] as never))
      },
    ],
    [
      'two weigh-ins on one day',
      (file) => {
        const [a, b] = rows(file, 'weights')
        if (a && b) b.date = a.date
      },
    ],
    [
      'two profiles',
      (file) => {
        file.tables.profile.push(structuredClone(file.tables.profile[0] as never))
      },
    ],
    [
      'a profile whose id is not the user',
      (file) => {
        first(file, 'profile').id = 'b0000000-0000-4000-8000-000000000002'
      },
    ],
    [
      'a recipe item whose food is missing',
      (file) => {
        first(file, 'recipe_items').food_id = 'f0000000-0000-4000-8000-000000000099'
      },
    ],
    [
      'a recipe item whose recipe is missing',
      (file) => {
        first(file, 'recipe_items').recipe_id = 'f0000000-0000-4000-8000-000000000099'
      },
    ],
    [
      'a log entry whose food is missing',
      (file) => {
        const entry = rows(file, 'log_entries').find((row) => row.food_id !== null)
        if (entry) entry.food_id = 'f0000000-0000-4000-8000-000000000099'
      },
    ],
    [
      'a log entry with two sources',
      (file) => {
        const entry = rows(file, 'log_entries').find((row) => row.food_id !== null)
        const recipe = first(file, 'recipes')
        if (entry) entry.recipe_id = recipe.id
      },
    ],
    [
      'a log entry before 2000',
      (file) => {
        first(file, 'log_entries').date = '1999-12-31'
      },
    ],
    [
      'a day before 2000',
      (file) => {
        first(file, 'days').date = '1999-12-31'
      },
    ],
    [
      'a log entry in an unknown meal',
      (file) => {
        first(file, 'log_entries').meal = 'brunch'
      },
    ],
    [
      'a food with too many kcal',
      (file) => {
        first(file, 'foods').kcal = 10001
      },
    ],
    [
      'a food with a blank name',
      (file) => {
        first(file, 'foods').name = '   '
      },
    ],
    [
      'a food with a name over 100 characters',
      (file) => {
        first(file, 'foods').name = 'a'.repeat(101)
      },
    ],
    [
      'a recipe with no servings',
      (file) => {
        first(file, 'recipes').servings = 0
      },
    ],
    [
      'a profile height out of range',
      (file) => {
        first(file, 'profile').height_cm = 300
      },
    ],
    [
      'a birth date after today',
      (file) => {
        first(file, 'profile').birth_date = '2026-11-22'
      },
    ],
    [
      'protein with more decimals than the column keeps',
      (file) => {
        first(file, 'foods').protein_g = 10.15
      },
    ],
    [
      'servings with more decimals than the column keeps',
      (file) => {
        first(file, 'log_entries').servings = 1.125
      },
    ],
    [
      'an edit time more than a day after the export',
      (file) => {
        first(file, 'foods').client_updated_at = '2026-11-22T09:00:00.001Z'
      },
    ],
    [
      'an export time more than a day ahead of this device',
      (file) => Object.assign(file, { exported_at: '2026-11-22T12:00:00.001Z' }),
    ],
    [
      'a deleted log entry',
      (file) => {
        first(file, 'log_entries').deleted_at = '2026-11-20T10:00:00.000Z'
      },
    ],
    [
      'an unknown activity level',
      (file) => {
        first(file, 'profile').activity_level = 'athlete'
      },
    ],
  ]

  it.each(invalid)('refuses a file with %s', (_case, change) => {
    expect(parseExport(edited(change), context)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('never throws or accepts arbitrary text', () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        expect(parseExport(text, context).ok).toBe(false)
      }),
    )
  })

  it('never throws or accepts arbitrary JSON', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        expect(parseExport(JSON.stringify(value), context).ok).toBe(false)
      }),
    )
  })

  it('never throws when any one column of a row is replaced', () => {
    const tables = Object.keys(sample.tables) as (keyof ExportFile['tables'])[]
    fc.assert(
      fc.property(
        fc.constantFrom(...tables.filter((table) => rows(sample, table).length > 0)),
        fc.nat(),
        fc.nat(),
        fc.jsonValue(),
        (table, rowIndex, columnIndex, value) => {
          const text = edited((file) => {
            const list = rows(file, table)
            const row = list[rowIndex % list.length]
            if (!row) return
            const columns = Object.keys(row)
            const column = columns[columnIndex % columns.length]
            if (column) row[column] = value
          })
          const result = parseExport(text, context)
          expect(typeof result.ok).toBe('boolean')
        },
      ),
    )
  })
})
