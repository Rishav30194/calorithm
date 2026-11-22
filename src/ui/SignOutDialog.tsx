import { useEffect, useId, useRef } from 'react'

import type { UnsentFile } from '@/data/DataProvider'
import { formatCount } from '@/domain/format'
import { strings } from '@/strings'

import { download } from './download'

type Props = {
  count: number
  locale: string
  onExport: () => UnsentFile | null
  onConfirm: () => void
  onCancel: () => void
}

// A modal <dialog> keeps focus inside it and closes on Escape, which counts as Cancel.
export const SignOutDialog = ({ count, locale, onExport, onConfirm, onCancel }: Props) => {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const bodyId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    dialog.showModal()
    return () => dialog.close()
  }, [])

  const exportChanges = () => {
    const file = onExport()
    if (file) download(file)
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onCancel={(event) => {
        event.preventDefault()
        onCancel()
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-xl border border-border bg-bg p-4 text-text backdrop:bg-bg/80"
    >
      <h2 id={titleId} className="mb-2 text-lg font-semibold">
        {strings.signOutWarning.title}
      </h2>
      <p id={bodyId} className="mb-4">
        {strings.signOutWarning.body(formatCount(count, locale), count === 1)}
      </p>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={exportChanges}
          className="min-h-11 rounded-lg bg-accent px-4 font-semibold text-accent-text"
        >
          {strings.signOutWarning.export}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="min-h-11 rounded-lg border border-border px-4 font-medium text-danger"
        >
          {strings.signOutWarning.confirm}
        </button>
        <button type="button" onClick={onCancel} className="min-h-11 rounded-lg px-4 font-medium">
          {strings.signOutWarning.cancel}
        </button>
      </div>
    </dialog>
  )
}
