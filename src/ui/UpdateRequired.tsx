import { useState } from 'react'

import { strings } from '@/strings'

export const UpdateRequired = ({ onUpdate }: { onUpdate: () => Promise<void> }) => {
  const [pending, setPending] = useState(false)
  const update = () => {
    setPending(true)
    void onUpdate()
  }
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-4 px-4 py-8">
      <h1 className="text-2xl font-semibold">{strings.update.title}</h1>
      <p>{strings.update.body}</p>
      <button
        type="button"
        onClick={update}
        disabled={pending}
        className="min-h-11 rounded-lg bg-accent px-4 font-semibold text-accent-text disabled:opacity-60"
      >
        {pending ? strings.update.updating : strings.update.button}
      </button>
    </main>
  )
}
