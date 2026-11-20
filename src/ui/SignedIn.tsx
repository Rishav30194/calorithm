import { useEffect, useState } from 'react'

import type { SignOutResult } from '@/data/auth'
import { useDiscard, useOutbox, useSetUnits, useSyncStatus, useUnits } from '@/data/DataProvider'

import { Shell } from './Shell'
import { SyncBadge } from './SyncBadge'
import { SyncPanel } from './SyncPanel'
import { UnitsSetting } from './UnitsSetting'
import { UpdateRequired } from './UpdateRequired'

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
  const { pending, failed } = useOutbox()
  return <SyncBadge status={status} pending={pending} failed={failed.length} />
}

const SyncSettings = () => {
  const status = useSyncStatus()
  const { pending, failed } = useOutbox()
  const units = useUnits()
  const setUnits = useSetUnits()
  const discard = useDiscard()
  const now = useNow()
  return (
    <>
      <UnitsSetting units={units} onChange={setUnits} />
      <SyncPanel
        status={status}
        pending={pending}
        failed={failed}
        now={now}
        locale={navigator.language}
        onDiscard={discard}
      />
    </>
  )
}

type Props = {
  email: string
  onSignOut: () => Promise<SignOutResult>
  onUpdate: () => Promise<void>
}

// The app for a signed-in user, inside <DataProvider>.
export const SignedIn = ({ email, onSignOut, onUpdate }: Props) => {
  const status = useSyncStatus()
  if (status.state === 'update_required') return <UpdateRequired onUpdate={onUpdate} />
  return <Shell email={email} onSignOut={onSignOut} badge={<Badge />} settings={<SyncSettings />} />
}
