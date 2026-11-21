import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import type { DeleteAccountResult } from '@/data/auth'
import { strings } from '@/strings'

import { DeleteAccountDialog } from './DeleteAccountDialog'

const text = strings.deleteAccount

// jsdom has no modal dialogs; the browser tests cover the real focus handling.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false
  }
})

afterEach(() => {
  vi.restoreAllMocks()
})

const setup = (result: DeleteAccountResult | Error = { ok: true }) => {
  const onDelete = vi.fn(async () => {
    if (result instanceof Error) throw result
    return result
  })
  const onClose = vi.fn()
  render(<DeleteAccountDialog email="someone@example.test" onDelete={onDelete} onClose={onClose} />)
  return { onDelete, onClose }
}

const confirmButton = () => screen.getByRole('button', { name: text.confirm })

describe('DeleteAccountDialog', () => {
  it('explains what is deleted and how to keep a copy', () => {
    setup()
    const dialog = screen.getByRole('dialog', { name: text.title })
    expect(dialog).toHaveTextContent(text.body)
    expect(dialog).toHaveTextContent(text.exportFirst)
  })

  it('needs the password before it can delete', async () => {
    const { onDelete } = setup()
    expect(confirmButton()).toBeDisabled()

    await userEvent.type(screen.getByLabelText(text.password), 'Synthetic-Pass-1')
    await userEvent.click(confirmButton())

    expect(onDelete).toHaveBeenCalledWith('someone@example.test', 'Synthetic-Pass-1')
  })

  it.each(['invalid_credentials', 'rate_limited', 'network', 'not_recent', 'unknown'] as const)(
    'explains a %s failure and stays open',
    async (failure) => {
      const { onClose } = setup({ ok: false, failure })
      await userEvent.type(screen.getByLabelText(text.password), 'wrong')
      await userEvent.click(confirmButton())

      expect(await screen.findByRole('alert')).toHaveTextContent(text.failures[failure])
      expect(screen.getByLabelText(text.password)).toHaveAttribute('aria-invalid', 'true')
      expect(onClose).not.toHaveBeenCalled()
      expect(confirmButton()).toBeEnabled()
    },
  )

  it('reports a thrown error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    setup(new Error('boom'))
    await userEvent.type(screen.getByLabelText(text.password), 'Synthetic-Pass-1')
    await userEvent.click(confirmButton())
    expect(await screen.findByRole('alert')).toHaveTextContent(text.failures.unknown)
  })

  it('closes on Cancel without deleting', async () => {
    const { onDelete, onClose } = setup()
    await userEvent.click(screen.getByRole('button', { name: text.cancel }))
    expect(onClose).toHaveBeenCalled()
    expect(onDelete).not.toHaveBeenCalled()
  })
})
