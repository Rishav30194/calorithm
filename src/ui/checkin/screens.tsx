import { useExportReminder } from '@/data/backupHooks'
import { useCheckinState, useSaveCheckin } from '@/data/checkinHooks'
import { strings } from '@/strings'

import { ScreenErrorBoundary } from '../ScreenErrorBoundary'
import { useToday } from '../useToday'
import { CheckinView } from './CheckinView'
import { ExportReminder } from './ExportReminder'

const Checkin = ({ locale }: { locale: string }) => {
  const today = useToday()
  const state = useCheckinState(today)
  const save = useSaveCheckin()
  const reminder = useExportReminder(today)
  if (!state) return <p className="text-muted">{strings.loading}</p>
  return (
    <div className="flex flex-col gap-6">
      <CheckinView state={state} locale={locale} onSave={save} />
      {reminder && <ExportReminder reminder={reminder} locale={locale} />}
    </div>
  )
}

// Loaded on demand from the shell, like the weight screen.
export const CheckinScreen = ({ locale }: { locale: string }) => (
  <ScreenErrorBoundary>
    <Checkin locale={locale} />
  </ScreenErrorBoundary>
)
