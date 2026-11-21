import { lazy, Suspense, useEffect, useState } from 'react'

import {
  useDiscard,
  useOutbox,
  useSetUnits,
  useSignOut,
  useSyncStatus,
  useUnits,
} from '@/data/DataProvider'

import { strings } from '@/strings'

import { ScreenErrorBoundary } from './ScreenErrorBoundary'
import { Shell } from './Shell'
import { SyncBadge } from './SyncBadge'
import { SyncPanel } from './SyncPanel'
import { UnitsSetting } from './UnitsSetting'
import { UpdateRequired } from './UpdateRequired'

// Food and recipe screens load on first visit, keeping them out of the first-load bundle.
// React caches a failed import, so a retry needs a new lazy component.
const loadFoodScreens = () =>
  lazy(() => import('./food/screens').then((module) => ({ default: module.FoodScreens })))
const loadLogScreen = () =>
  lazy(() => import('./log/screens').then((module) => ({ default: module.LogScreen })))
const loadWeightScreen = () =>
  lazy(() => import('./weight/screens').then((module) => ({ default: module.WeightScreen })))
const loadCheckinScreen = () =>
  lazy(() => import('./checkin/screens').then((module) => ({ default: module.CheckinScreen })))
const loadProfileScreen = () =>
  lazy(() =>
    import('./profile/screens').then((module) => ({ default: module.ProfileSettingsScreen })),
  )

// Re-renders every 30 seconds so "Last synced 5 minutes ago" stays current.
const useNow = (): number => {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])
  return now
}

const Badge = () => {
  const status = useSyncStatus()
  const outbox = useOutbox()
  return <SyncBadge status={status} outbox={outbox} />
}

const SyncSettings = () => {
  const status = useSyncStatus()
  const outbox = useOutbox()
  const units = useUnits()
  const setUnits = useSetUnits()
  const discard = useDiscard()
  const now = useNow()
  const [ProfileScreen, setProfileScreen] = useState(loadProfileScreen)
  return (
    <>
      <ScreenErrorBoundary onRetry={() => setProfileScreen(() => loadProfileScreen())}>
        <Suspense fallback={<p className="text-muted">{strings.loading}</p>}>
          <ProfileScreen locale={navigator.language} />
        </Suspense>
      </ScreenErrorBoundary>
      <UnitsSetting units={units} onChange={setUnits} />
      <SyncPanel
        status={status}
        outbox={outbox}
        now={now}
        locale={navigator.language}
        onDiscard={discard}
      />
    </>
  )
}

type Props = {
  email: string
  onUpdate: () => Promise<void>
}

// The app for a signed-in user, inside <DataProvider>.
export const SignedIn = ({ email, onUpdate }: Props) => {
  const status = useSyncStatus()
  const signOut = useSignOut()
  const [FoodScreens, setFoodScreens] = useState(loadFoodScreens)
  const [LogScreen, setLogScreen] = useState(loadLogScreen)
  const [WeightScreen, setWeightScreen] = useState(loadWeightScreen)
  const [CheckinScreen, setCheckinScreen] = useState(loadCheckinScreen)
  if (status.state === 'update_required') return <UpdateRequired onUpdate={onUpdate} />
  return (
    <Shell
      email={email}
      signOut={signOut}
      badge={<Badge />}
      settings={<SyncSettings />}
      logScreen={(date) => (
        <ScreenErrorBoundary onRetry={() => setLogScreen(() => loadLogScreen())}>
          <Suspense fallback={<p className="text-muted">{strings.loading}</p>}>
            <LogScreen date={date} locale={navigator.language} />
          </Suspense>
        </ScreenErrorBoundary>
      )}
      weightScreen={
        <ScreenErrorBoundary onRetry={() => setWeightScreen(() => loadWeightScreen())}>
          <Suspense fallback={<p className="text-muted">{strings.loading}</p>}>
            <WeightScreen locale={navigator.language} />
          </Suspense>
        </ScreenErrorBoundary>
      }
      checkinScreen={
        <ScreenErrorBoundary onRetry={() => setCheckinScreen(() => loadCheckinScreen())}>
          <Suspense fallback={<p className="text-muted">{strings.loading}</p>}>
            <CheckinScreen locale={navigator.language} />
          </Suspense>
        </ScreenErrorBoundary>
      }
      foodScreens={(route) => (
        // Catches a chunk that fails to load, such as offline before it was cached.
        <ScreenErrorBoundary onRetry={() => setFoodScreens(() => loadFoodScreens())}>
          <Suspense fallback={<p className="text-muted">{strings.loading}</p>}>
            <FoodScreens route={route} locale={navigator.language} />
          </Suspense>
        </ScreenErrorBoundary>
      )}
    />
  )
}
