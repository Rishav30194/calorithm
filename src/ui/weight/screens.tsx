import { useUnits } from '@/data/DataProvider'
import { useWeighIns, useWeightActions } from '@/data/weightHooks'
import { strings } from '@/strings'

import { ScreenErrorBoundary } from '../ScreenErrorBoundary'
import { useToday } from '../useToday'
import { WeightView } from './WeightView'

const Weight = ({ locale }: { locale: string }) => {
  const today = useToday()
  const units = useUnits()
  const weighIns = useWeighIns()
  const actions = useWeightActions()
  if (!weighIns) return <p className="text-muted">{strings.loading}</p>
  return (
    <WeightView
      today={today}
      unit={units === 'imperial' ? 'lb' : 'kg'}
      locale={locale}
      weighIns={weighIns}
      onSave={actions.set}
      onRemove={actions.remove}
    />
  )
}

// Loaded on demand from the shell, like the log and food screens.
export const WeightScreen = ({ locale }: { locale: string }) => (
  <ScreenErrorBoundary>
    <Weight locale={locale} />
  </ScreenErrorBoundary>
)
