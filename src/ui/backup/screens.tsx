import { checkImportFile, useExportData, useImportData, useLastExportDay } from '@/data/backupHooks'

import { download } from '../download'
import { useToday } from '../useToday'
import { BackupView } from './BackupView'

// Loaded on demand from the settings screen, keeping the export file code out of the
// first-load bundle.
export const BackupScreen = ({ locale }: { locale: string }) => {
  const today = useToday()
  const lastExportDay = useLastExportDay()
  const exportData = useExportData()
  const importData = useImportData()
  return (
    <BackupView
      lastExportDay={lastExportDay}
      locale={locale}
      onExport={() => exportData(today)}
      onSave={download}
      onCheck={(text) => checkImportFile(text, { now: new Date(), today })}
      onImport={(text) => importData(text, today)}
    />
  )
}
