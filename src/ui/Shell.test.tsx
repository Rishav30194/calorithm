import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SignOutControls, SignOutState } from '@/data/DataProvider'
import { strings } from '@/strings'

import { Shell } from './Shell'

// jsdom has no modal dialogs; the browser tests cover the real focus handling.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false
  }
})

const controls = (state: SignOutState, overrides: Partial<SignOutControls> = {}) => ({
  state,
  start: vi.fn(async () => {}),
  confirm: vi.fn(),
  cancel: vi.fn(),
  unsentFile: vi.fn(() => ({ name: 'calorithm-unsent-changes-2026-11-20.json', contents: '{}' })),
  ...overrides,
})

const renderShell = (signOut: SignOutControls) =>
  render(<Shell email="seed.user@calorithm.test" signOut={signOut} />)

describe('Shell settings', () => {
  beforeEach(() => {
    window.location.hash = '#/settings'
  })

  it('starts sign-out', async () => {
    const signOut = controls({ step: 'idle' })
    renderShell(signOut)

    await userEvent.click(screen.getByRole('button', { name: strings.settings.signOut }))

    expect(signOut.start).toHaveBeenCalledOnce()
  })

  it('disables the button while syncing before sign-out', () => {
    renderShell(controls({ step: 'syncing' }))

    expect(screen.getByRole('button', { name: strings.settings.signingOut })).toBeDisabled()
  })

  it('shows a failed sign-out and lets you retry', async () => {
    const signOut = controls({ step: 'failed' })
    renderShell(signOut)

    expect(screen.getByRole('alert')).toHaveTextContent(strings.settings.signOutFailed)
    await userEvent.click(screen.getByRole('button', { name: strings.settings.signOut }))
    expect(signOut.start).toHaveBeenCalledOnce()
  })
})

describe('Sign-out warning', () => {
  beforeEach(() => {
    window.location.hash = '#/settings'
  })

  it('says how many changes would be lost', () => {
    renderShell(controls({ step: 'confirm', count: 2 }))

    const dialog = screen.getByRole('dialog', { name: strings.signOutWarning.title })
    expect(dialog).toHaveTextContent(strings.signOutWarning.body(2))
  })

  it('signs out anyway or cancels', async () => {
    const signOut = controls({ step: 'confirm', count: 1 })
    renderShell(signOut)

    await userEvent.click(screen.getByRole('button', { name: strings.signOutWarning.confirm }))
    expect(signOut.confirm).toHaveBeenCalledOnce()

    await userEvent.click(screen.getByRole('button', { name: strings.signOutWarning.cancel }))
    expect(signOut.cancel).toHaveBeenCalledOnce()
  })

  it('cancels when the dialog is dismissed with Escape', () => {
    const signOut = controls({ step: 'confirm', count: 1 })
    renderShell(signOut)

    screen.getByRole('dialog').dispatchEvent(new Event('cancel'))

    expect(signOut.cancel).toHaveBeenCalledOnce()
  })

  it('downloads the unsent changes', async () => {
    const createObjectURL = vi.fn(() => 'blob:unsent')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const signOut = controls({ step: 'confirm', count: 1 })
    renderShell(signOut)

    await userEvent.click(screen.getByRole('button', { name: strings.signOutWarning.export }))

    expect(signOut.unsentFile).toHaveBeenCalledOnce()
    expect(click).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:unsent')
    vi.unstubAllGlobals()
    click.mockRestore()
  })
})
