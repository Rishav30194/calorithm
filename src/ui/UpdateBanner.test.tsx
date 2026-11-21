import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { strings } from '@/strings'

import { UpdateBanner } from './UpdateBanner'

const text = strings.update

describe('UpdateBanner', () => {
  it('says a new version is ready in its own named region', () => {
    render(<UpdateBanner onUpdate={vi.fn(async () => {})} onDismiss={vi.fn()} />)
    expect(screen.getByRole('region', { name: text.region })).toHaveTextContent(text.available)
  })

  it('updates only when asked, and shows that it is updating', async () => {
    let finish = () => {}
    const onUpdate = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    render(<UpdateBanner onUpdate={onUpdate} onDismiss={vi.fn()} />)
    expect(onUpdate).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: text.reload }))

    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: text.updating })).toBeDisabled()
    finish()
  })

  it('can be put off', async () => {
    const onDismiss = vi.fn()
    render(<UpdateBanner onUpdate={vi.fn(async () => {})} onDismiss={onDismiss} />)
    await userEvent.click(screen.getByRole('button', { name: text.later }))
    expect(onDismiss).toHaveBeenCalled()
  })
})
