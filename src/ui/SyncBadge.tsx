import type { OutboxView } from '@/data/DataProvider'
import type { SyncStatus } from '@/data/sync/engine'
import { formatCount } from '@/domain/format'
import { strings } from '@/strings'

type Props = { status: SyncStatus; outbox: OutboxView; locale: string }

const message = ({ status, outbox, locale }: Props): string | null => {
  if (status.state === 'update_required') return null
  switch (outbox.state) {
    // Nothing until the counts load, so the badge never shows a count it doesn't have yet.
    case 'loading':
      return null
    // Settings says why and offers to try again. An expired session or no network needs no
    // counts, so those still show.
    case 'failed':
      if (status.problem === 'signed_out') return strings.sync.badge.signedOut
      if (status.problem === 'offline') return strings.sync.badge.offline(null)
      return strings.sync.badge.unknown
    case 'loaded':
      break
  }
  const { pending } = outbox.summary
  const failed = outbox.summary.failed.length
  if (failed > 0) return strings.sync.badge.failed(formatCount(failed, locale), failed === 1)
  if (status.problem === 'signed_out') return strings.sync.badge.signedOut
  if (status.problem === 'offline') {
    return strings.sync.badge.offline(pending > 0 ? formatCount(pending, locale) : null)
  }
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
