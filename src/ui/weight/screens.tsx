import { useWeighIns, useWeightActions, useWeightUnit } from '@/data/weightHooks'
import { strings } from '@/strings'

import { ScreenErrorBoundary } from '../ScreenErrorBoundary'
import { useToday } from '../useToday'
import { WeightView } from './WeightView'

const Weight = ({ locale }: { locale: string }) => {
  const today = useToday()
  const unit = useWeightUnit()
  const weighIns = useWeighIns()
  const actions = useWeightActions()
  if (!weighIns || !unit) return <p className="text-muted">{strings.loading}</p>
  return (
    <WeightView
      today={today}
      unit={unit}
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
