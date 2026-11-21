import type { OutboxSummary } from '@/data/DataProvider'
import type { SyncStatus } from '@/data/sync/engine'
import { strings } from '@/strings'

// The outbox is undefined while it loads.
type Props = { status: SyncStatus; outbox: OutboxSummary | undefined }

const message = ({ status, outbox }: Props): string | null => {
  if (status.state === 'update_required') return null
  // Nothing until the counts load, so the badge never shows a count it doesn't have yet.
  if (outbox === undefined) return null
  const { pending } = outbox
  const failed = outbox.failed.length
  if (failed > 0) return strings.sync.badge.failed(failed)
  if (status.problem === 'signed_out') return strings.sync.badge.signedOut
  if (status.problem === 'offline') return strings.sync.badge.offline(pending)
  if (status.state === 'syncing') return strings.sync.badge.syncing
  return null
}

// Nothing when all is well; a short note in the header when something needs attention.
export const SyncBadge = (props: Props) => {
  const text = message(props)
  if (!text) return null
  return (
    <p role="status" className="rounded-full border border-border px-3 py-1 text-sm text-muted">
      {text}
    </p>
  )
}
