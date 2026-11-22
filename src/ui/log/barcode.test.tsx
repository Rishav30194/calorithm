import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { BarcodeLookup } from '@/data/barcodeLookup'
import type { FoodView } from '@/data/foods'
import { strings } from '@/strings'

import { BarcodePanel } from './BarcodePanel'

const text = strings.log.barcode
const editor = strings.foods.editor

const paneer: FoodView = {
  id: 'f1',
  name: 'Paneer',
  servingSize: 100,
  servingUnit: 'g',
  kcal: 265,
  proteinG: 18.3,
  carbsG: 1.2,
  fatG: 20.8,
  catalogId: null,
  barcode: '8901234567890',
  archived: false,
}

const renderPanel = (result: BarcodeLookup, start: 'scan' | 'enter' = 'enter') => {
  const handlers = {
    onLookup: vi.fn(async () => result),
    onLogSaved: vi.fn(async () => true),
    onLogNew: vi.fn(async () => true),
    onBack: vi.fn(),
    onDone: vi.fn(),
  }
  render(<BarcodePanel start={start} locale="en-US" {...handlers} />)
  return handlers
}

const lookUp = async (code: string) => {
  await userEvent.type(screen.getByLabelText(text.code), code)
  await userEvent.click(screen.getByRole('button', { name: text.lookUp }))
}

describe('BarcodePanel', () => {
  it('logs your saved food for a known barcode, then closes', async () => {
    const handlers = renderPanel({
      kind: 'saved',
      barcode: '8901234567890',
      foods: [paneer, { ...paneer, id: 'f2', name: 'Old paneer', archived: true }],
    })
    await lookUp('8901234567890')

    expect(handlers.onLookup).toHaveBeenCalledWith('8901234567890')
    expect(screen.getByText(text.archived)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^Paneer/ }))
    expect(handlers.onLogSaved).toHaveBeenCalledWith('f1')
    expect(handlers.onDone).toHaveBeenCalled()
  })

  it('fills the form from Open Food Facts, with its credit, and saves the food as from there', async () => {
    const handlers = renderPanel({
      kind: 'product',
      barcode: '3017620422003',
      product: {
        name: 'Nutella',
        servingSize: 100,
        servingUnit: 'g',
        kcal: 539,
        proteinG: 6.3,
        carbsG: 57.5,
        fatG: null,
      },
    })
    await lookUp('3017620422003')

    expect(screen.getByText(text.found)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: strings.openFoodFacts.credit })).toHaveAttribute(
      'href',
      'https://world.openfoodfacts.org',
    )
    expect(screen.getByLabelText(editor.name)).toHaveValue('Nutella')
    expect(screen.getByLabelText(editor.kcal)).toHaveValue('539')
    expect(screen.getByLabelText(editor.barcode)).toHaveValue('3017620422003')
    // A value the label lacks is left for you to enter.
    expect(screen.getByLabelText(editor.fatG)).toHaveValue('')
    await userEvent.type(screen.getByLabelText(editor.fatG), '30.9')
    await userEvent.click(screen.getByRole('button', { name: text.saveAndLog }))

    expect(handlers.onLogNew).toHaveBeenCalledWith({
      name: 'Nutella',
      servingSize: 100,
      servingUnit: 'g',
      kcal: 539,
      proteinG: 6.3,
      carbsG: 57.5,
      fatG: 30.9,
      barcode: '3017620422003',
      catalogId: 'openfoodfacts',
    })
    expect(handlers.onDone).toHaveBeenCalled()
  })

  it('opens an empty form with the barcode for an unknown code, and for no network', async () => {
    renderPanel({ kind: 'not_found', barcode: '96385074' })
    await lookUp('96385074')
    expect(screen.getByText(text.notFound)).toBeInTheDocument()
    expect(screen.getByLabelText(editor.name)).toHaveValue('')
    expect(screen.getByLabelText(editor.barcode)).toHaveValue('96385074')
    expect(screen.queryByRole('link', { name: strings.openFoodFacts.credit })).toBeNull()
  })

  it('says when Open Food Facts can’t be reached, and saves a food typed in without its credit', async () => {
    const handlers = renderPanel({ kind: 'unreachable', barcode: '96385074' })
    await lookUp('96385074')
    expect(screen.getByText(text.unreachable)).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText(editor.name), 'Biscuits')
    await userEvent.type(screen.getByLabelText(editor.servingSize), '1')
    await userEvent.type(screen.getByLabelText(editor.servingUnit), 'pack')
    for (const label of [editor.kcal, editor.proteinG, editor.carbsG, editor.fatG]) {
      await userEvent.type(screen.getByLabelText(label), '1')
    }
    await userEvent.click(screen.getByRole('button', { name: text.saveAndLog }))
    expect(handlers.onLogNew).toHaveBeenCalledWith(
      expect.not.objectContaining({ catalogId: expect.anything() }),
    )
  })

  it('logs a saved food once, however fast it’s tapped', async () => {
    let finish: (ok: boolean) => void = () => {}
    const handlers = renderPanel({ kind: 'saved', barcode: '8901234567890', foods: [paneer] })
    handlers.onLogSaved.mockImplementation(() => new Promise((resolve) => (finish = resolve)))
    await lookUp('8901234567890')

    const row = screen.getByRole('button', { name: /^Paneer/ })
    await userEvent.click(row)
    await userEvent.click(row)
    finish(true)
    expect(handlers.onLogSaved).toHaveBeenCalledTimes(1)
  })

  it('looks up again from the unreachable message', async () => {
    const handlers = renderPanel({ kind: 'unreachable', barcode: '96385074' })
    await lookUp('96385074')
    handlers.onLookup.mockResolvedValue({ kind: 'not_found', barcode: '96385074' })

    await userEvent.click(screen.getByRole('button', { name: text.tryAgain }))
    expect(handlers.onLookup).toHaveBeenLastCalledWith('96385074')
    expect(await screen.findByText(text.notFound)).toBeInTheDocument()
  })

  it('keeps the code and says the lookup failed when it throws', async () => {
    const handlers = renderPanel({ kind: 'not_found', barcode: '96385074' })
    handlers.onLookup.mockRejectedValue(new Error('database closed'))
    await lookUp('96385074')

    expect(screen.getByRole('alert')).toHaveTextContent(text.lookupFailed)
    expect(screen.getByLabelText(text.code)).toHaveValue('96385074')
  })

  it('shows one error when saving a scanned food fails', async () => {
    const handlers = renderPanel({ kind: 'not_found', barcode: '96385074' })
    handlers.onLogNew.mockResolvedValue(false)
    await lookUp('96385074')
    await userEvent.type(screen.getByLabelText(editor.name), 'Biscuits')
    await userEvent.type(screen.getByLabelText(editor.servingSize), '1')
    await userEvent.type(screen.getByLabelText(editor.servingUnit), 'pack')
    for (const label of [editor.kcal, editor.proteinG, editor.carbsG, editor.fatG]) {
      await userEvent.type(screen.getByLabelText(label), '1')
    }
    await userEvent.click(screen.getByRole('button', { name: text.saveAndLog }))

    expect(await screen.findAllByRole('alert')).toHaveLength(1)
    expect(handlers.onDone).not.toHaveBeenCalled()
  })

  it('names a wrong check digit on the code field', async () => {
    renderPanel({ kind: 'invalid', reason: 'check_digit' })
    await lookUp('6291041500214')
    expect(screen.getByLabelText(text.code)).toHaveAccessibleDescription(
      expect.stringContaining(strings.foods.errors.barcodeCheckDigit),
    )
  })

  it('offers typing the code when the camera is denied', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: {
        getUserMedia: vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError')),
      },
    })
    renderPanel({ kind: 'not_found', barcode: '96385074' }, 'scan')

    expect(await screen.findByRole('alert')).toHaveTextContent(text.denied)
    expect(screen.getByLabelText(text.code)).toBeInTheDocument()
  })

  it('offers typing the code when there’s no camera', async () => {
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: undefined })
    renderPanel({ kind: 'not_found', barcode: '96385074' }, 'scan')

    expect(await screen.findByRole('alert')).toHaveTextContent(text.noCamera)
  })
})
