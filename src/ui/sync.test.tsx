import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { FailedChange } from '@/data/DataProvider'
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

describe('SyncBadge', () => {
  it('shows nothing when everything is synced', () => {
    const { container } = render(<SyncBadge status={synced} pending={0} failed={0} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows offline with the number of changes waiting', () => {
    render(<SyncBadge status={offline} pending={2} failed={0} />)
    expect(screen.getByRole('status')).toHaveTextContent(strings.sync.badge.offline(2))
  })

  it('puts refused changes first', () => {
    render(<SyncBadge status={offline} pending={2} failed={1} />)
    expect(screen.getByRole('status')).toHaveTextContent(strings.sync.badge.failed(1))
  })

  it('shows a paused sync when the session expired', () => {
    const status: SyncStatus = { state: 'idle', lastSyncedAt: null, problem: 'signed_out' }
    render(<SyncBadge status={status} pending={0} failed={0} />)
    expect(screen.getByRole('status')).toHaveTextContent(strings.sync.badge.signedOut)
  })
})

describe('SyncPanel', () => {
  const panel = (overrides: Partial<Parameters<typeof SyncPanel>[0]> = {}) =>
    render(
      <SyncPanel
        status={synced}
        pending={0}
        failed={[]}
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
    panel({ status: offline, pending: 3 })
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
        pending={0}
        failed={[]}
        now={now}
        locale="en-GB"
        onDiscard={async () => ({ status: 'done' })}
      />,
    )
    expect(screen.queryByText(strings.sync.allSynced)).not.toBeInTheDocument()
  })

  it('lists refused changes with their reason and discards one', async () => {
    const onDiscard = vi.fn(async (): Promise<DiscardOutcome> => ({ status: 'done' }))
    panel({ failed: [refused], onDiscard })

    expect(screen.getByText(strings.sync.failedReason(refused.message))).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: strings.sync.discard }))

    expect(onDiscard).toHaveBeenCalledWith(7)
  })

  it('says a discard needs the network when offline', async () => {
    panel({ failed: [refused], onDiscard: async () => ({ status: 'retry_later' }) })

    await userEvent.setup().click(screen.getByRole('button', { name: strings.sync.discard }))

    expect(await screen.findByRole('alert')).toHaveTextContent(strings.sync.discardOffline)
    expect(screen.getByRole('button', { name: strings.sync.discard })).toBeEnabled()
  })

  it('says to sign in again when a discard finds the session expired', async () => {
    panel({ failed: [refused], onDiscard: async () => ({ status: 'needs_auth' }) })

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
