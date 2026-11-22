import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { FailedChange, OutboxView } from '@/data/DataProvider'
import type { SetUnitsResult } from '@/data/profile'
import type { DiscardOutcome } from '@/data/sync/discard'
import type { SyncStatus } from '@/data/sync/engine'
import { strings } from '@/strings'

import { SyncBadge } from './SyncBadge'
import { SyncPanel } from './SyncPanel'
import { UnitsSetting } from './UnitsSetting'
import { UpdateRequired } from './UpdateRequired'

const now = Date.parse('2026-11-20T10:00:00.000Z')
const synced: SyncStatus = { state: 'idle', lastSyncedAt: now - 5 * 60_000, problem: null }
const offline: SyncStatus = { state: 'idle', lastSyncedAt: null, problem: 'offline' }
const refused: FailedChange = {
  seq: 7,
  table: 'profile',
  code: '23514',
  message: 'violates check constraint',
}

const box = (pending: number, failed: FailedChange[] = []): OutboxView => ({
  state: 'loaded',
  summary: { pending, failed },
})
const loading: OutboxView = { state: 'loading' }

describe('SyncBadge', () => {
  it('shows nothing when everything is synced', () => {
    const { container } = render(<SyncBadge status={synced} outbox={box(0)} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows offline with the number of changes waiting', () => {
    render(<SyncBadge status={offline} outbox={box(2)} />)
    expect(screen.getByRole('status')).toHaveTextContent(strings.sync.badge.offline(2))
  })

  it('puts refused changes first', () => {
    render(<SyncBadge status={offline} outbox={box(2, [refused])} />)
    expect(screen.getByRole('status')).toHaveTextContent(strings.sync.badge.failed(1))
  })

  it('shows a paused sync when the session expired', () => {
    const status: SyncStatus = { state: 'idle', lastSyncedAt: null, problem: 'signed_out' }
    render(<SyncBadge status={status} outbox={box(0)} />)
    expect(screen.getByRole('status')).toHaveTextContent(strings.sync.badge.signedOut)
  })

  it('shows nothing until the outbox loads, rather than a count it doesn’t have', () => {
    const { container } = render(<SyncBadge status={offline} outbox={loading} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('a failed outbox read', () => {
  it('shows in the badge as an unknown status', () => {
    render(<SyncBadge status={synced} outbox={{ state: 'failed', retry: vi.fn() }} />)
    expect(screen.getByRole('status')).toHaveTextContent(strings.sync.badge.unknown)
  })

  it('shows in the panel with Try again, and never as everything synced', async () => {
    const retry = vi.fn()
    render(
      <SyncPanel
        status={synced}
        outbox={{ state: 'failed', retry }}
        now={now}
        locale="en-GB"
        onDiscard={async () => ({ status: 'done' })}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(strings.sync.outboxFailed)
    expect(screen.queryByText(strings.sync.allSynced)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: strings.sync.retry }))
    expect(retry).toHaveBeenCalled()
  })
})

describe('SyncPanel', () => {
  const panel = (overrides: Partial<Parameters<typeof SyncPanel>[0]> = {}) =>
    render(
      <SyncPanel
        status={synced}
        outbox={box(0)}
        now={now}
        locale="en-GB"
        onDiscard={async () => ({ status: 'done' })}
        {...overrides}
      />,
    )

  it('says when it last synced', () => {
    panel()
    expect(screen.getByText(strings.sync.lastSynced('5 minutes ago'))).toBeInTheDocument()
    expect(screen.getByText(strings.sync.allSynced)).toBeInTheDocument()
  })

  it('explains being offline and counts the changes waiting', () => {
    panel({ status: offline, outbox: box(3) })
    expect(screen.getByText(strings.sync.neverSynced)).toBeInTheDocument()
    expect(screen.getByText(strings.sync.waiting(3))).toBeInTheDocument()
    expect(screen.getByText(strings.sync.offline)).toBeInTheDocument()
  })

  it('only says everything is synced after a sync succeeded with no problem', () => {
    const { rerender } = panel({ status: offline })
    expect(screen.queryByText(strings.sync.allSynced)).not.toBeInTheDocument()

    const neverSynced: SyncStatus = { state: 'idle', lastSyncedAt: null, problem: null }
    rerender(
      <SyncPanel
        status={neverSynced}
        outbox={box(0)}
        now={now}
        locale="en-GB"
        onDiscard={async () => ({ status: 'done' })}
      />,
    )
    expect(screen.queryByText(strings.sync.allSynced)).not.toBeInTheDocument()
  })

  // The outbox count loads after the first render; until then the panel can't know.
  it('says it’s checking, not that everything is synced, until the outbox loads', () => {
    const { rerender } = panel({ outbox: loading })
    expect(screen.getByText(strings.sync.checking)).toBeInTheDocument()
    expect(screen.queryByText(strings.sync.allSynced)).not.toBeInTheDocument()
    expect(screen.getByText(strings.sync.lastSynced('5 minutes ago'))).toBeInTheDocument()

    rerender(
      <SyncPanel
        status={synced}
        outbox={box(1)}
        now={now}
        locale="en-GB"
        onDiscard={async () => ({ status: 'done' })}
      />,
    )
    expect(screen.queryByText(strings.sync.checking)).not.toBeInTheDocument()
    expect(screen.getByText(strings.sync.waiting(1))).toBeInTheDocument()
    expect(screen.queryByText(strings.sync.allSynced)).not.toBeInTheDocument()
  })

  it('lists refused changes with their reason and discards one', async () => {
    const onDiscard = vi.fn(async (): Promise<DiscardOutcome> => ({ status: 'done' }))
    panel({ outbox: box(0, [refused]), onDiscard })

    expect(screen.getByText(strings.sync.failedReason(refused.message))).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: strings.sync.discard }))

    expect(onDiscard).toHaveBeenCalledWith(7)
  })

  it('says a discard needs the network when offline', async () => {
    panel({ outbox: box(0, [refused]), onDiscard: async () => ({ status: 'retry_later' }) })

    await userEvent.setup().click(screen.getByRole('button', { name: strings.sync.discard }))

    expect(await screen.findByRole('alert')).toHaveTextContent(strings.sync.discardOffline)
    expect(screen.getByRole('button', { name: strings.sync.discard })).toBeEnabled()
  })

  it('says to sign in again when a discard finds the session expired', async () => {
    panel({ outbox: box(0, [refused]), onDiscard: async () => ({ status: 'needs_auth' }) })

    await userEvent.setup().click(screen.getByRole('button', { name: strings.sync.discard }))

    expect(await screen.findByRole('alert')).toHaveTextContent(strings.sync.signedOut)
  })
})

describe('UnitsSetting', () => {
  it('shows the current units and reports a change', async () => {
    const onChange = vi.fn(async (): Promise<SetUnitsResult> => ({ ok: true }))
    render(<UnitsSetting units="metric" onChange={onChange} />)

    expect(screen.getByRole('radio', { name: strings.units.metric })).toBeChecked()
    await userEvent.setup().click(screen.getByRole('radio', { name: strings.units.imperial }))

    expect(onChange).toHaveBeenCalledWith('imperial')
    expect(screen.getByRole('radio', { name: strings.units.imperial })).toBeChecked()
  })

  it('goes back to the saved units and explains when the change can’t be made offline', async () => {
    render(
      <UnitsSetting units="metric" onChange={async () => ({ ok: false, reason: 'offline' })} />,
    )

    await userEvent.setup().click(screen.getByRole('radio', { name: strings.units.imperial }))

    expect(await screen.findByRole('alert')).toHaveTextContent(strings.units.offline)
    expect(screen.getByRole('radio', { name: strings.units.metric })).toBeChecked()
  })

  it('goes back to the saved units when saving fails', async () => {
    render(
      <UnitsSetting
        units="metric"
        onChange={async () => {
          throw new Error('quota exceeded')
        }}
      />,
    )

    await userEvent.setup().click(screen.getByRole('radio', { name: strings.units.imperial }))

    expect(await screen.findByRole('alert')).toHaveTextContent(strings.units.failed)
    expect(screen.getByRole('radio', { name: strings.units.metric })).toBeChecked()
  })
})

describe('UpdateRequired', () => {
  it('starts the update once and shows progress', async () => {
    const onUpdate = vi.fn(() => new Promise<void>(() => {}))
    render(<UpdateRequired onUpdate={onUpdate} />)

    expect(screen.getByRole('heading', { name: strings.update.title })).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: strings.update.button }))

    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: strings.update.updating })).toBeDisabled()
  })
})
