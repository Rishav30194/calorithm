import { useCallback } from 'react'

import { buildExport, exportFileName, type ImportResult, importData } from './backup/backup'
import { type ParseExportResult, parseExport } from './backup/format'
import { useData } from './DataProvider'

export type ExportedFile = { name: string; contents: string }

// Builds the file. Recording the export is left to the caller, once the file is saved
// (useRecordExport). `today` is the device's local day.
export const useExportData = (): ((today: string) => Promise<ExportedFile>) => {
  const { ctx, userId } = useData()
  return useCallback(
    async (today) => {
      const file = await buildExport(ctx.db, userId, ctx.clock(), __APP_VERSION__)
      return { name: exportFileName(today), contents: JSON.stringify(file, null, 2) }
    },
    [ctx, userId],
  )
}

// Checks a file without writing anything, for the confirmation before an import. Uses the
// same clock as the import, so a file the check accepts isn't refused when imported.
export const useCheckImportFile = (): ((text: string, today: string) => ParseExportResult) => {
  const { ctx } = useData()
  return useCallback((text, today) => parseExport(text, { now: ctx.clock(), today }), [ctx])
}

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
