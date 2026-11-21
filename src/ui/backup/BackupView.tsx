import { type ChangeEvent, useId, useRef, useState } from 'react'

import type { ImportResult } from '@/data/backup/backup'
import type { ExportFile, ImportFailure, ParseExportResult } from '@/data/backup/format'
import { MAX_EXPORT_CHARS } from '@/data/backup/format'
import type { ExportedFile } from '@/data/backupHooks'
import { strings } from '@/strings'

import { longDate, longMoment } from '../dates'
import { Modal } from '../Modal'

type Props = {
  // Null when this device never exported; undefined while loading.
  lastExportDay: string | null | undefined
  locale: string
  onExport: () => Promise<ExportedFile>
  // Saves the file on the device.
  onSave: (file: ExportedFile) => void
  onCheck: (text: string) => ParseExportResult
  onImport: (text: string) => Promise<ImportResult>
}

type Status =
  | { kind: 'idle' }
  | { kind: 'busy'; action: 'export' | 'import' }
  | { kind: 'exported' }
  | { kind: 'imported'; written: number; skipped: number }
  | { kind: 'error'; message: string }

const text = strings.backup

const failureMessage = (reason: ImportFailure): string => {
  switch (reason) {
    case 'too_large':
      return text.tooLarge
    case 'not_json':
      return text.notJson
    case 'not_export':
      return text.notExport
    case 'newer_version':
      return text.newerVersion
    case 'invalid':
      return text.invalid
  }
}

const itemCount = (file: ExportFile): number =>
  Object.values(file.tables).reduce((total, rows) => total + rows.length, 0)

const buttonClass =
  'min-h-11 self-start rounded-lg border border-border px-4 font-medium disabled:opacity-60'

export const BackupView = ({
  lastExportDay,
  locale,
  onExport,
  onSave,
  onCheck,
  onImport,
}: Props) => {
  const headingId = useId()
  const fileInput = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [pending, setPending] = useState<{ text: string; file: ExportFile } | null>(null)
  const count = (value: number) => new Intl.NumberFormat(locale).format(value)
  const busy = status.kind === 'busy'

  const exportData = async () => {
    setStatus({ kind: 'busy', action: 'export' })
    try {
      onSave(await onExport())
      setStatus({ kind: 'exported' })
    } catch {
      setStatus({ kind: 'error', message: text.exportFailed })
    }
  }

  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    // Cleared at once, so choosing the same file again still fires a change.
    input.value = ''
    if (!file) return
    // One UTF-16 unit takes at most 3 bytes in UTF-8, so a larger file can't fit the parser's
    // limit, and isn't read into memory.
    if (file.size > MAX_EXPORT_CHARS * 3) {
      setStatus({ kind: 'error', message: text.tooLarge })
      return
    }
    try {
      const contents = await file.text()
      const checked = onCheck(contents)
      if (!checked.ok) {
        setStatus({ kind: 'error', message: failureMessage(checked.reason) })
        return
      }
      setStatus({ kind: 'idle' })
      setPending({ text: contents, file: checked.file })
    } catch {
      setStatus({ kind: 'error', message: text.importFailed })
    }
  }

  const importFile = async (contents: string) => {
    setPending(null)
    setStatus({ kind: 'busy', action: 'import' })
    try {
      const result = await onImport(contents)
      setStatus(
        result.ok
          ? { kind: 'imported', written: result.written, skipped: result.skipped }
          : { kind: 'error', message: failureMessage(result.reason) },
      )
    } catch {
      setStatus({ kind: 'error', message: text.importFailed })
    }
  }

  const message = () => {
    switch (status.kind) {
      case 'idle':
      case 'busy':
        return null
      case 'exported':
        return <p role="status">{text.exported}</p>
      case 'imported':
        return <p role="status">{text.imported(count(status.written), count(status.skipped))}</p>
      case 'error':
        return (
          <p role="alert" className="text-danger">
            {status.message}
          </p>
        )
    }
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="text-lg font-semibold">
        {text.title}
      </h2>
      <p>{text.body}</p>
      {lastExportDay !== undefined && (
        <p className="text-muted">
          {lastExportDay === null
            ? text.neverExported
            : text.lastExport(longDate(lastExportDay, locale))}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void exportData()}
          disabled={busy}
          className={buttonClass}
        >
          {busy && status.action === 'export' ? text.exporting : text.export}
        </button>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
          className={buttonClass}
        >
          {busy && status.action === 'import' ? text.importing : text.import}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          aria-label={text.fileLabel}
          onChange={(event) => void chooseFile(event)}
          hidden
        />
      </div>
      {message()}
      {pending && (
        <Modal title={text.confirmTitle} onClose={() => setPending(null)}>
          <p>
            {text.confirmBody(
              longMoment(pending.file.exported_at, locale),
              text.items(itemCount(pending.file), count(itemCount(pending.file))),
            )}
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => void importFile(pending.text)}
              className="min-h-11 rounded-lg bg-accent px-4 font-semibold text-accent-text"
            >
              {text.confirm}
            </button>
            <button
              type="button"
              onClick={() => setPending(null)}
              className="min-h-11 rounded-lg px-4 font-medium"
            >
              {text.cancel}
            </button>
          </div>
        </Modal>
      )}
    </section>
  )
}
