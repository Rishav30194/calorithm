import { useCheckinState, useSaveCheckin } from '@/data/checkinHooks'
import { strings } from '@/strings'

import { ScreenErrorBoundary } from '../ScreenErrorBoundary'
import { useToday } from '../useToday'
import { CheckinView } from './CheckinView'

const Checkin = ({ locale }: { locale: string }) => {
  const today = useToday()
  const state = useCheckinState(today)
  const save = useSaveCheckin()
  if (!state) return <p className="text-muted">{strings.loading}</p>
  return <CheckinView state={state} locale={locale} onSave={save} />
}

// Loaded on demand from the shell, like the weight screen.
export const CheckinScreen = ({ locale }: { locale: string }) => (
  <ScreenErrorBoundary>
    <Checkin locale={locale} />
  </ScreenErrorBoundary>
)
