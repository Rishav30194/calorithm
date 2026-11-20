import { useState } from 'react'

import type { FailedChange } from '@/data/DataProvider'
import type { DiscardOutcome } from '@/data/sync/discard'
import type { SyncStatus } from '@/data/sync/engine'
import { formatAgo } from '@/domain/format'
import { strings } from '@/strings'

type Props = {
  status: SyncStatus
  pending: number
  failed: FailedChange[]
  now: number
  locale: string
  onDiscard: (seq: number) => Promise<DiscardOutcome>
}

const lastSyncedLine = (status: SyncStatus, now: number, locale: string): string => {
  if (status.state === 'update_required') return strings.update.title
  if (status.state === 'syncing') return strings.sync.syncing
  if (status.lastSyncedAt === null) return strings.sync.neverSynced
  return strings.sync.lastSynced(formatAgo(now - status.lastSyncedAt, locale))
}

const Refused = ({
  change,
  onDiscard,
}: {
  change: FailedChange
  onDiscard: Props['onDiscard']
}) => {
  const [pending, setPending] = useState(false)
  const [offline, setOffline] = useState(false)
  const discard = async () => {
    setPending(true)
    setOffline(false)
    const result = await onDiscard(change.seq)
    setPending(false)
    setOffline(result.status !== 'done')
  }
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <p>{strings.sync.failedReason(change.message)}</p>
      {offline && (
        <p role="alert" className="text-danger">
          {strings.sync.discardOffline}
        </p>
      )}
      <button
        type="button"
        onClick={discard}
        disabled={pending}
        className="min-h-11 self-start rounded-lg border border-border px-4 font-medium disabled:opacity-60"
      >
        {pending ? strings.sync.discarding : strings.sync.discard}
      </button>
    </li>
  )
}

export const SyncPanel = ({ status, pending, failed, now, locale, onDiscard }: Props) => {
  const problem = status.state === 'update_required' ? null : status.problem
  return (
    <section aria-labelledby="sync-title" className="flex flex-col gap-2">
      <h2 id="sync-title" className="text-lg font-semibold">
        {strings.sync.title}
      </h2>
      <p>{lastSyncedLine(status, now, locale)}</p>
      <p className="text-muted">
        {pending > 0
          ? strings.sync.waiting(pending)
          : failed.length === 0 && strings.sync.allSynced}
      </p>
      {problem === 'offline' && <p className="text-muted">{strings.sync.offline}</p>}
      {problem === 'signed_out' && <p className="text-danger">{strings.sync.signedOut}</p>}
      {failed.length > 0 && (
        <>
          <h3 className="mt-2 font-semibold">{strings.sync.failedTitle}</h3>
          <ul className="flex flex-col gap-2">
            {failed.map((change) => (
              <Refused key={change.seq} change={change} onDiscard={onDiscard} />
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
