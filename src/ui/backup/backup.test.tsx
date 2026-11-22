import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import type { ExportFile, ParseExportResult } from '@/data/backup/format'
import { MAX_EXPORT_CHARS } from '@/data/backup/format'
import { strings } from '@/strings'

import { ExportReminder } from '../checkin/ExportReminder'
import { BackupView } from './BackupView'

const text = strings.backup

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

const exportFile: ExportFile = {
  format: 'calorithm-export',
  version: 1,
  exported_at: '2026-11-20T12:00:00.000Z',
  app_version: '0.1.0',
  user_id: 'a0000000-0000-4000-8000-000000000001',
  tables: {
    profile: [],
    foods: [],
    recipes: [],
    recipe_items: [],
    days: [],
    log_entries: [],
    weights: [
      {
        id: 'b0000000-0000-4000-8000-000000000001',
        user_id: 'a0000000-0000-4000-8000-000000000001',
        date: '2026-11-20',
        weight_kg: 82,
        updated_at: '2026-11-20T10:00:00.000Z',
        client_updated_at: '2026-11-20T10:00:00.000Z',
        deleted_at: null,
        schema_version: 1,
      },
    ],
    checkins: [],
  },
}

const setup = (overrides: Partial<Parameters<typeof BackupView>[0]> = {}) => {
  const props = {
    lastExportDay: null,
    locale: 'en-GB',
    onExport: vi.fn(async () => ({ name: 'calorithm-export-2026-11-21.json', contents: '{}' })),
    onSave: vi.fn(async () => {}),
    onCheck: vi.fn((): ParseExportResult => ({ ok: true, file: exportFile })),
    onImport: vi.fn(async () => ({ ok: true as const, written: 1200, skipped: 3 })),
    ...overrides,
  }
  render(<BackupView {...props} />)
  return props
}

const choose = (contents: string) => {
  fireEvent.change(screen.getByLabelText(text.fileLabel), {
    target: { files: [new File([contents], 'export.json', { type: 'application/json' })] },
  })
}

describe('BackupView', () => {
  it('says when this device last exported', () => {
    setup({ lastExportDay: '2026-10-02' })
    expect(screen.getByText(text.lastExport('2 October 2026'))).toBeVisible()
  })

  it('says when this device never exported', () => {
    setup()
    expect(screen.getByText(text.neverExported)).toBeVisible()
  })

  it('builds the file, saves it, and confirms', async () => {
    const props = setup()
    await userEvent.click(screen.getByRole('button', { name: text.export }))

    expect(props.onSave).toHaveBeenCalledWith({
      name: 'calorithm-export-2026-11-21.json',
      contents: '{}',
    })
    expect(screen.getByRole('status')).toHaveTextContent(text.exported)
  })

  it('reports a save that fails, which the caller then never records', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    setup({ onSave: vi.fn(async () => Promise.reject(new Error('blocked'))) })
    await userEvent.click(screen.getByRole('button', { name: text.export }))
    expect(screen.getByRole('alert')).toHaveTextContent(text.exportFailed)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('reports a failed export', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    setup({ onExport: vi.fn(async () => Promise.reject(new Error('quota'))) })
    await userEvent.click(screen.getByRole('button', { name: text.export }))
    expect(screen.getByRole('alert')).toHaveTextContent(text.exportFailed)
  })

  it('asks before importing, with the export date and item count, then reports', async () => {
    const props = setup()
    choose('{"format":"calorithm-export"}')

    const dialog = await screen.findByRole('dialog', { name: text.confirmTitle })
    expect(dialog).toHaveTextContent(text.confirmBody('20 November 2026', '1 item'))
    expect(props.onImport).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: text.confirm }))

    expect(props.onImport).toHaveBeenCalledWith('{"format":"calorithm-export"}')
    expect(await screen.findByRole('status')).toHaveTextContent(text.imported('1,200', '3'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('imports nothing when the confirmation is cancelled', async () => {
    const props = setup()
    choose('{}')
    await screen.findByRole('dialog', { name: text.confirmTitle })
    await userEvent.click(screen.getByRole('button', { name: text.cancel }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(props.onImport).not.toHaveBeenCalled()
  })

  it.each([
    ['too_large', text.tooLarge],
    ['not_json', text.notJson],
    ['not_export', text.notExport],
    ['newer_version', text.newerVersion],
    ['invalid', text.invalid],
  ] as const)('explains a %s file and never asks to import it', async (reason, message) => {
    const props = setup({ onCheck: vi.fn((): ParseExportResult => ({ ok: false, reason })) })
    choose('{}')

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(props.onImport).not.toHaveBeenCalled()
  })

  it('refuses a file too large to read without reading it', async () => {
    const props = setup()
    const file = new File(['{}'], 'huge.json')
    Object.defineProperty(file, 'size', { value: MAX_EXPORT_CHARS * 3 + 1 })
    fireEvent.change(screen.getByLabelText(text.fileLabel), { target: { files: [file] } })

    expect(await screen.findByRole('alert')).toHaveTextContent(text.tooLarge)
    expect(props.onCheck).not.toHaveBeenCalled()
  })

  it('counts only live rows in the confirmation', async () => {
    const weight = exportFile.tables.weights[0]
    if (!weight) throw new Error('no weigh-in in the sample')
    const withDeleted: ExportFile = {
      ...exportFile,
      tables: {
        ...exportFile.tables,
        foods: [
          {
            id: 'f0000000-0000-4000-8000-000000000001',
            user_id: weight.user_id,
            name: 'Old bar',
            serving_size: 1,
            serving_unit: 'bar',
            kcal: 200,
            protein_g: 10,
            carbs_g: null,
            fat_g: null,
            catalog_id: null,
            barcode: null,
            archived_at: null,
            updated_at: weight.updated_at,
            client_updated_at: weight.client_updated_at,
            deleted_at: '2026-11-20T11:00:00.000Z',
            schema_version: 1,
          },
        ],
      },
    }
    setup({ onCheck: vi.fn((): ParseExportResult => ({ ok: true, file: withDeleted })) })
    choose('{}')
    const dialog = await screen.findByRole('dialog', { name: text.confirmTitle })
    expect(dialog).toHaveTextContent(text.confirmBody('20 November 2026', '1 item'))
  })

  it('reports an import that fails while writing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    setup({ onImport: vi.fn(async () => Promise.reject(new Error('disk'))) })
    choose('{}')
    await screen.findByRole('dialog', { name: text.confirmTitle })
    await userEvent.click(screen.getByRole('button', { name: text.confirm }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(text.importFailed))
  })
})

describe('ExportReminder', () => {
  it('asks for a first export', () => {
    render(<ExportReminder reminder={{ kind: 'never' }} locale="en-GB" />)
    expect(screen.getByText(strings.exportReminder.never)).toBeVisible()
    expect(screen.getByRole('link', { name: strings.exportReminder.link })).toHaveAttribute(
      'href',
      '#/settings',
    )
  })

  it('names the last export date', () => {
    render(
      <ExportReminder reminder={{ kind: 'stale', lastExportDay: '2026-10-02' }} locale="en-GB" />,
    )
    expect(screen.getByText(strings.exportReminder.stale('2 October 2026'))).toBeVisible()
  })
})
