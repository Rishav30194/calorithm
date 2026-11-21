import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback } from 'react'

import type { ExportReminder } from '@/domain/backup'

import { exportReminderOn, lastExportDay, recordExport } from './backup/reminder'
import { useData } from './DataProvider'

// Apart from backupHooks.ts, so the check-in screen's chunk doesn't load the export file code.

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

// Called once the file is handed to the browser to save. The browser gives no sign that the
// file was kept, so that counts as exporting.
export const useRecordExport = (): ((today: string) => Promise<void>) => {
  const { ctx } = useData()
  return useCallback((today) => recordExport(ctx.db, today), [ctx])
}
