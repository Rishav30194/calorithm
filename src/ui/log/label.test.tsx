import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { strings } from '@/strings'

import { BarcodePanel } from './BarcodePanel'
import { LabelPanel } from './LabelPanel'

const text = strings.log.label
const editor = strings.foods.editor

// Synthetic label text, as Live Text would copy it.
const label = `Nutrition information
Typical values Per 100g Per 30g serving
Energy 1569kJ/373kcal 471kJ/112kcal
Fat 6.8g 2.0g
Carbohydrate 62.1g 18.6g
Protein 11.2g 3.4g`

const renderPanel = (barcode: string | null = null) => {
  const handlers = {
    onLogNew: vi.fn(async () => true),
    onBack: vi.fn(),
    onDone: vi.fn(),
  }
  render(<LabelPanel barcode={barcode} locale="en-US" {...handlers} />)
  return handlers
}

const paste = async (value: string) => {
  await userEvent.click(screen.getByLabelText(text.text))
  await userEvent.paste(value)
  await userEvent.click(screen.getByRole('button', { name: text.read }))
}

describe('LabelPanel', () => {
  it('fills the form from pasted label text, for you to name and save', async () => {
    const handlers = renderPanel()
    await paste(label)

    expect(screen.getByRole('status')).toHaveTextContent(text.check)
    expect(screen.getByLabelText(editor.servingSize)).toHaveValue('100')
    expect(screen.getByLabelText(editor.servingUnit)).toHaveValue('g')
    expect(screen.getByLabelText(editor.kcal)).toHaveValue('373')
    expect(screen.getByLabelText(editor.fatG)).toHaveValue('6.8')
    await userEvent.type(screen.getByLabelText(editor.name), 'Muesli')
    await userEvent.click(screen.getByRole('button', { name: strings.log.barcode.saveAndLog }))

    expect(handlers.onLogNew).toHaveBeenCalledWith({
      name: 'Muesli',
      servingSize: 100,
      servingUnit: 'g',
      kcal: 373,
      proteinG: 11.2,
      carbsG: 62.1,
      fatG: 6.8,
    })
    expect(handlers.onDone).toHaveBeenCalled()
  })

  it('says which values it couldn’t read, leaving them empty', async () => {
    renderPanel()
    await paste('Per 100 g\nEnergy 250 kcal\nProtein 5 g')

    expect(screen.getByRole('status')).toHaveTextContent(text.partial)
    expect(screen.getByLabelText(editor.carbsG)).toHaveValue('')
  })

  it('says when the text has no nutrition values, and offers entering the food by hand', async () => {
    renderPanel('96385074')
    await paste('Best before 12/2027')

    expect(screen.getByLabelText(text.text)).toHaveAccessibleDescription(
      expect.stringContaining(text.nothingRead),
    )
    await userEvent.click(screen.getByRole('button', { name: text.enterByHand }))
    expect(screen.getByLabelText(editor.name)).toHaveValue('')
    expect(screen.getByLabelText(editor.barcode)).toHaveValue('96385074')
  })
})

describe('reading the label after an unknown barcode', () => {
  it('keeps the barcode on the food read from the label, and goes back to the form', async () => {
    const onLogNew = vi.fn(async () => true)
    render(
      <BarcodePanel
        start="enter"
        locale="en-US"
        onLookup={vi.fn(async () => ({ kind: 'unreachable' as const, barcode: '96385074' }))}
        onLogSaved={vi.fn()}
        onLogNew={onLogNew}
        onBack={vi.fn()}
        onDone={vi.fn()}
      />,
    )
    await userEvent.type(screen.getByLabelText(strings.log.barcode.code), '96385074')
    await userEvent.click(screen.getByRole('button', { name: strings.log.barcode.lookUp }))

    await userEvent.click(screen.getByRole('button', { name: strings.log.barcode.readLabel }))
    expect(screen.getAllByRole('button', { name: /^Back/ })).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: strings.log.barcode.backToForm }))
    expect(screen.getByText(strings.log.barcode.unreachable)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: strings.log.barcode.readLabel }))
    await paste(label)
    await userEvent.type(screen.getByLabelText(editor.name), 'Muesli')
    await userEvent.click(screen.getByRole('button', { name: strings.log.barcode.saveAndLog }))
    expect(onLogNew).toHaveBeenCalledWith(
      expect.objectContaining({ barcode: '96385074', kcal: 373 }),
    )
  })

  it('keeps what you typed when you switch to the label and back, and closes once', async () => {
    const onDone = vi.fn()
    render(
      <BarcodePanel
        start="enter"
        locale="en-US"
        onLookup={vi.fn(async () => ({ kind: 'not_found' as const, barcode: '96385074' }))}
        onLogSaved={vi.fn()}
        onLogNew={vi.fn(async () => true)}
        onBack={vi.fn()}
        onDone={onDone}
      />,
    )
    await userEvent.type(screen.getByLabelText(strings.log.barcode.code), '96385074')
    await userEvent.click(screen.getByRole('button', { name: strings.log.barcode.lookUp }))
    await userEvent.type(screen.getByLabelText(editor.name), 'Muesli')

    await userEvent.click(screen.getByRole('button', { name: strings.log.barcode.readLabel }))
    await userEvent.click(screen.getByRole('button', { name: strings.log.barcode.backToForm }))
    expect(screen.getByLabelText(editor.name)).toHaveValue('Muesli')

    await userEvent.click(screen.getByRole('button', { name: strings.log.barcode.readLabel }))
    await paste(label)
    expect(screen.getByLabelText(editor.name)).toHaveValue('Muesli')
    await userEvent.click(screen.getByRole('button', { name: strings.log.barcode.saveAndLog }))
    expect(onDone).toHaveBeenCalledTimes(1)
  })
})

describe('LabelPanel errors', () => {
  it('clears the nothing-read message once the text changes', async () => {
    renderPanel()
    await paste('Best before 12/2027')
    await userEvent.type(screen.getByLabelText(text.text), 'x')
    expect(screen.getByLabelText(text.text)).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByRole('button', { name: text.enterByHand })).toBeNull()
  })
})
