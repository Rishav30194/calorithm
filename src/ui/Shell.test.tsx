import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SignOutResult } from '@/data/auth'
import { strings } from '@/strings'

import { Shell } from './Shell'

describe('Shell settings', () => {
  beforeEach(() => {
    window.location.hash = '#/settings'
  })

  it('shows a failed sign-out and lets you retry', async () => {
    const onSignOut = vi
      .fn<() => Promise<SignOutResult>>()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true })
    render(<Shell email="seed.user@calorithm.test" onSignOut={onSignOut} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: strings.settings.signOut }))

    expect(await screen.findByRole('alert')).toHaveTextContent(strings.settings.signOutFailed)
    const retry = screen.getByRole('button', { name: strings.settings.signOut })
    expect(retry).toBeEnabled()

    await user.click(retry)
    expect(onSignOut).toHaveBeenCalledTimes(2)
  })
})
