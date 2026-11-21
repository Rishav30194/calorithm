import { type FormEvent, useId, useState } from 'react'

import type { DeleteAccountResult } from '@/data/auth'
import { strings } from '@/strings'

import { Modal } from './Modal'

type Props = {
  email: string
  onDelete: (email: string, password: string) => Promise<DeleteAccountResult>
  onClose: () => void
}

const text = strings.deleteAccount

export const DeleteAccountDialog = ({ email, onDelete, onClose }: Props) => {
  const passwordId = useId()
  const errorId = useId()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy || password === '') return
    setBusy(true)
    setError(null)
    try {
      const result = await onDelete(email, password)
      // On success the app shows the loading screen, then sign-in, so the dialog goes with it.
      if (!result.ok) setError(text.failures[result.failure])
    } catch (caught) {
      console.error('deleting the account failed', caught)
      setError(text.failures.unknown)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={text.title} onClose={onClose}>
      <p>{text.body}</p>
      <p>{text.exportFirst}</p>
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
        {/* Lets password managers fill the right account. */}
        <input type="email" name="email" value={email} autoComplete="username" readOnly hidden />
        <div className="flex flex-col gap-1">
          <label htmlFor={passwordId} className="font-medium">
            {text.password}
          </label>
          <input
            id={passwordId}
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            required
            className="min-h-11 rounded-lg border border-border bg-bg px-3 text-base aria-[invalid=true]:border-danger"
          />
        </div>
        {error && (
          <p id={errorId} role="alert" className="text-danger">
            {error}
          </p>
        )}
        <div className="flex flex-col gap-2">
          <button
            type="submit"
            disabled={busy || password === ''}
            className="min-h-11 rounded-lg border border-danger px-4 font-semibold text-danger disabled:opacity-60"
          >
            {busy ? text.deleting : text.confirm}
          </button>
          <button type="button" onClick={onClose} className="min-h-11 rounded-lg px-4 font-medium">
            {text.cancel}
          </button>
        </div>
      </form>
    </Modal>
  )
}
