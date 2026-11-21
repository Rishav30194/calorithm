import { type ReactNode, useEffect, useId, useRef } from 'react'

type Props = {
  title: string
  onClose: () => void
  children: ReactNode
  // Shown beside the title, such as a Close button.
  action?: ReactNode
}

// A modal <dialog>: focus stays inside it, and Escape closes it.
export const Modal = ({ title, onClose, children, action }: Props) => {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    dialog.showModal()
    return () => dialog.close()
  }, [])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      className="m-auto flex max-h-[85dvh] w-[calc(100%-2rem)] max-w-sm flex-col gap-3 overflow-y-auto rounded-xl border border-border bg-bg p-4 text-text backdrop:bg-bg/80"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </dialog>
  )
}
