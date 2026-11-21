import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback } from 'react'

import type { ExportReminder } from '@/domain/backup'

import { buildExport, exportFileName, type ImportResult, importData } from './backup/backup'
import { type ParseContext, type ParseExportResult, parseExport } from './backup/format'
import { exportReminderOn, lastExportDay, recordExport } from './backup/reminder'
import { useData } from './DataProvider'

export type ExportedFile = { name: string; contents: string }

// The check-in screen's reminder; undefined while loading.
export const useExportReminder = (today: string): ExportReminder | null | undefined => {
  const { ctx } = useData()
  return useLiveQuery(() => exportReminderOn(ctx.db, today), [ctx.db, today])
}

// The local day of this device's last export; null when it never exported, undefined while
// loading.
export const useLastExportDay = (): string | null | undefined => {
  const { ctx } = useData()
  return useLiveQuery(() => lastExportDay(ctx.db), [ctx.db])
}

// Builds the file and records the export. The browser gives no sign that the file was saved,
// so asking for it counts as exporting. `today` is the device's local day.
export const useExportData = (): ((today: string) => Promise<ExportedFile>) => {
  const { ctx, userId } = useData()
  return useCallback(
    async (today) => {
      const file = await buildExport(ctx.db, userId, ctx.clock(), __APP_VERSION__)
      await recordExport(ctx.db, today)
      return { name: exportFileName(today), contents: JSON.stringify(file, null, 2) }
    },
    [ctx, userId],
  )
}

// Checks a file without writing anything, for the confirmation before an import.
export const checkImportFile = (text: string, context: ParseContext): ParseExportResult =>
  parseExport(text, context)

// Imports a file, then asks sync to send what it wrote.
export const useImportData = (): ((text: string, today: string) => Promise<ImportResult>) => {
  const { ctx, userId, engine } = useData()
  return useCallback(
    async (text, today) => {
      const result = await importData(ctx.db, text, userId, { now: ctx.clock(), today })
      if (result.ok && result.written > 0) engine.request('write')
      return result
    },
    [ctx, userId, engine],
  )
}
