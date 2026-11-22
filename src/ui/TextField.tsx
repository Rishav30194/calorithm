import { useId } from 'react'

type Props = {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string | undefined
  // For a field whose error is shown elsewhere, such as one message for several fields.
  invalid?: boolean
  describedBy?: string | undefined
  hint?: string | undefined
  inputMode?: 'text' | 'decimal' | 'numeric' | 'search'
  type?: 'text' | 'search' | 'date'
  min?: string
  max?: string
  autoFocus?: boolean
  // A text area this many rows tall, for text such as a pasted nutrition label.
  rows?: number
  disabled?: boolean
}

// A labelled input whose hint and error are announced with it. Text is 16 pixels so iPhone
// doesn't zoom, and the field is at least 44 pixels tall.
export const TextField = ({
  label,
  value,
  onChange,
  error,
  invalid = false,
  describedBy: externalDescription,
  hint,
  inputMode = 'text',
  type = 'text',
  min,
  max,
  autoFocus = false,
  rows,
  disabled = false,
}: Props) => {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null, externalDescription ?? null]
    .filter(Boolean)
    .join(' ')
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {rows !== undefined ? (
        <textarea
          id={id}
          rows={rows}
          disabled={disabled}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error || invalid ? true : undefined}
          aria-describedby={describedBy || undefined}
          className="rounded-lg border border-border bg-bg px-3 py-2 text-base disabled:opacity-60 aria-[invalid=true]:border-danger"
        />
      ) : (
        <input
          id={id}
          type={type}
          min={min}
          max={max}
          inputMode={inputMode}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error || invalid ? true : undefined}
          aria-describedby={describedBy || undefined}
          // biome-ignore lint/a11y/noAutofocus: only fields in a dialog the user just opened, such as the picker's search or an amount
          autoFocus={autoFocus}
          className="min-h-11 rounded-lg border border-border bg-bg px-3 text-base aria-[invalid=true]:border-danger"
        />
      )}
      {error && (
        <p id={errorId} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
