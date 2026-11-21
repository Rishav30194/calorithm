import { useState } from 'react'

import { strings } from '@/strings'

type Props = { onUpdate: () => Promise<void>; onDismiss: () => void }

const text = strings.update

// Shown above every screen when a new deployment is waiting. The app never reloads on its
// own, so an entry in progress is never lost; Update reloads into the new version.
export const UpdateBanner = ({ onUpdate, onDismiss }: Props) => {
  const [pending, setPending] = useState(false)
  const update = () => {
    setPending(true)
    void onUpdate()
  }
  return (
    <section
      aria-label={text.region}
      className="border-b border-border bg-bg px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3"
    >
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-2">
        <p aria-live="polite" className="min-w-0 flex-1 basis-60">
          {text.available}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={update}
            disabled={pending}
            className="min-h-11 rounded-lg bg-accent px-4 font-semibold text-accent-text disabled:opacity-60"
          >
            {pending ? text.updating : text.reload}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            disabled={pending}
            className="min-h-11 rounded-lg border border-border px-4 font-medium disabled:opacity-60"
          >
            {text.later}
          </button>
        </div>
      </div>
    </section>
  )
}
