import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { EXPORT_REMINDER_DAYS, exportReminder } from './backup'
import { addDays } from './dates'

const day = fc
  .integer({ min: Date.UTC(2000, 0, 1), max: Date.UTC(2100, 0, 1) })
  .map((ms) => new Date(ms).toISOString().slice(0, 10))

const today = '2026-11-21'

describe('exportReminder', () => {
  it('is quiet on a device with no data and no export', () => {
    expect(exportReminder({ lastExportDay: null, firstDataDay: null, today })).toBeNull()
  })

  it('counts from the last export', () => {
    expect(
      exportReminder({ lastExportDay: addDays(today, -30), firstDataDay: '2020-01-01', today }),
    ).toBeNull()
    expect(
      exportReminder({ lastExportDay: addDays(today, -31), firstDataDay: '2020-01-01', today }),
    ).toEqual({ kind: 'stale', lastExportDay: addDays(today, -31) })
  })

  it('counts from the oldest data when nothing was ever exported', () => {
    expect(
      exportReminder({ lastExportDay: null, firstDataDay: addDays(today, -30), today }),
    ).toBeNull()
    expect(
      exportReminder({ lastExportDay: null, firstDataDay: addDays(today, -31), today }),
    ).toEqual({ kind: 'never' })
  })

  it('shows exactly when more than the reminder period has passed', () => {
    fc.assert(
      fc.property(day, fc.integer({ min: -400, max: 400 }), (since, age) => {
        const now = addDays(since, age)
        const due = age > EXPORT_REMINDER_DAYS
        expect(
          exportReminder({ lastExportDay: since, firstDataDay: null, today: now }) !== null,
        ).toBe(due)
        expect(
          exportReminder({ lastExportDay: null, firstDataDay: since, today: now }) !== null,
        ).toBe(due)
      }),
    )
  })
})
