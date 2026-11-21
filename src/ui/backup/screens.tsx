import { useCheckImportFile, useExportData, useImportData } from '@/data/backupHooks'
import { useLastExportDay, useRecordExport } from '@/data/exportReminderHooks'

import { download } from '../download'
import { useToday } from '../useToday'
import { BackupView } from './BackupView'

// Loaded on demand from the settings screen, keeping the export file code out of the
// first-load bundle.
export const BackupScreen = ({ locale }: { locale: string }) => {
  const today = useToday()
  const lastExportDay = useLastExportDay()
  const exportData = useExportData()
  const recordExport = useRecordExport()
  const checkFile = useCheckImportFile()
  const importData = useImportData()
  return (
    <BackupView
      lastExportDay={lastExportDay}
      locale={locale}
      onExport={() => exportData(today)}
      onSave={async (file) => {
        download(file)
        await recordExport(today)
      }}
      onCheck={(text) => checkFile(text, today)}
      onImport={(text) => importData(text, today)}
    />
  )
}
