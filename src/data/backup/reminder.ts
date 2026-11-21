import { type ExportReminder, exportReminder } from '@/domain/backup'

import type { LocalDb } from '../db'
import { logEntriesSpec, type TableSpec, weightsSpec } from '../tables'

// Kept apart from the export file code, so the check-in screen's chunk doesn't load it.

// The local day of this device's last export. Only this device knows it: the reminder is about
// a file saved here, and another device's file may not be at hand.
export const recordExport = async (db: LocalDb, day: string): Promise<void> => {
  await db.meta.put({ key: 'lastExportDay', value: day })
}

export const lastExportDay = async (db: LocalDb): Promise<string | null> =>
  (await db.meta.get('lastExportDay'))?.value ?? null

// Rows this version can't read, such as a newer version's, are skipped rather than ending the
// search.
const oldestLiveDate = async (db: LocalDb, spec: TableSpec): Promise<string | null> => {
  const row = spec.parse(
    await db
      .rows(spec.name)
      .orderBy('date')
      .filter((raw) => spec.parse(raw)?.deleted_at === null)
      .first(),
  )
  return row && 'date' in row && typeof row.date === 'string' ? row.date : null
}

// The oldest day with a live log entry or weigh-in on this device.
export const firstDataDay = async (db: LocalDb): Promise<string | null> => {
  const dates = [await oldestLiveDate(db, logEntriesSpec), await oldestLiveDate(db, weightsSpec)]
  return dates.reduce<string | null>(
    (oldest, date) => (date !== null && (oldest === null || date < oldest) ? date : oldest),
    null,
  )
}

export const exportReminderOn = async (
  db: LocalDb,
  today: string,
): Promise<ExportReminder | null> =>
  exportReminder({
    lastExportDay: await lastExportDay(db),
    firstDataDay: await firstDataDay(db),
    today,
  })
