import { type FormEvent, useState } from 'react'

import type { LoggedEntry } from '@/data/log'
import { strings } from '@/strings'
import { editableNumber } from '../food/forms'
import { Modal } from '../Modal'
import { TextField } from '../TextField'
import { parseServings } from './parse'

type Props = {
  entry: LoggedEntry
  locale: string
  // False when the entry is no longer stored, for example removed on another device.
  onSave: (servings: number) => Promise<boolean>
  onRemove: () => Promise<void>
  onClose: () => void
}

export const EntryDialog = ({ entry, locale, onSave, onRemove, onClose }: Props) => {
  const text = strings.log.entry
  const [servings, setServings] = useState(() => editableNumber(entry.servings, locale))
  const [error, setError] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const run = async (write: () => Promise<boolean>) => {
    setBusy(true)
    setFailed(false)
    try {
      if (await write()) onClose()
      else setFailed(true)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const parsed = parseServings(servings)
    if (parsed === null) {
      setError(strings.recipes.errors.itemServings)
      return
    }
    setError(undefined)
    void run(() => onSave(parsed))
  }

  return (
    <Modal title={entry.name} onClose={onClose}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        <TextField
          label={text.servings}
          value={servings}
          onChange={setServings}
          inputMode="decimal"
          error={error}
        />
        {failed && (
          <p role="alert" className="text-danger">
            {text.failed}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="min-h-11 rounded-lg bg-accent px-4 font-semibold text-accent-text disabled:opacity-60"
        >
          {text.save}
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await onRemove()
                return true
              })
            }
            className="min-h-11 flex-1 rounded-lg border border-border px-4 font-medium text-danger disabled:opacity-60"
          >
            {text.remove}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 flex-1 rounded-lg border border-border px-4 font-medium"
          >
            {text.cancel}
          </button>
        </div>
      </form>
    </Modal>
  )
}
