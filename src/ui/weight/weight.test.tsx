import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import type { SetWeighInResult } from '@/data/weights'
import type { WeighIn } from '@/domain/trend'
import type { WeightUnit } from '@/domain/weight'
import { strings } from '@/strings'

import { WeightView } from './WeightView'

// jsdom has no modal dialogs; the browser tests cover the real focus handling.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false
  }
})

const text = strings.weight
const today = '2026-11-21'

const saved = (weighIn: WeighIn): SetWeighInResult => ({
  ok: true,
  row: {
    id: 'w1',
    user_id: 'u1',
    date: weighIn.date,
    weight_kg: weighIn.kg,
    updated_at: '',
    client_updated_at: '',
    deleted_at: null,
    schema_version: 1,
  },
})

const renderView = (
  weighIns: WeighIn[],
  {
    unit = 'kg' as WeightUnit,
    onSave = vi.fn(async (w: WeighIn) => saved(w)),
    onRemove = vi.fn(async () => {}),
  } = {},
) => {
  render(
    <WeightView
      today={today}
      unit={unit}
      locale="en-GB"
      weighIns={weighIns}
      onSave={onSave}
      onRemove={onRemove}
    />,
  )
  return { onSave, onRemove }
}

// A week's steady loss: 80 on 11-14, then 79 on 11-21. Trend: 80, carried, then 79.9.
const week: WeighIn[] = [
  { date: '2026-11-14', kg: 80 },
  { date: '2026-11-21', kg: 79 },
]

describe('WeightView', () => {
  it('invites a first weigh-in when there are none', () => {
    renderView([])
    expect(screen.getByText(text.empty)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: text.chartTitle })).not.toBeInTheDocument()
  })

  it('shows the trend and its change over 7 days', () => {
    renderView(week)
    expect(screen.getByText('Trend 79.9 kg')).toBeInTheDocument()
    expect(screen.getByText('Down 0.1 kg in the last 7 days')).toBeInTheDocument()
  })

  it('shows weights in pounds without changing what it saves', async () => {
    const { onSave } = renderView(week, { unit: 'lb' })
    expect(screen.getByText('Trend 176.1 lb')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText(text.weight('lb')), '180')
    await userEvent.click(screen.getByRole('button', { name: text.save }))
    expect(onSave).toHaveBeenCalledWith({ date: today, kg: 81.65 })
  })

  it('says no change when the trend moved less than shown', () => {
    renderView([
      { date: '2026-11-14', kg: 80 },
      { date: '2026-11-21', kg: 80.2 },
    ])
    expect(screen.getByText(text.steady)).toBeInTheDocument()
  })

  it('describes the chart for screen readers and hides the drawing', () => {
    renderView(week)
    const chart = screen.getByRole('region', { name: text.chartTitle })
    expect(chart).toHaveTextContent(
      'Chart from Sat 14 Nov to Sat 21 Nov: weigh-ins between 79 kg and 80 kg, and the trend line.',
    )
    expect(chart.querySelector('svg')?.closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('names the real weigh-ins in the summary, not the widened chart range', () => {
    renderView([{ date: today, kg: 80 }])
    expect(screen.getByRole('region', { name: text.chartTitle })).toHaveTextContent(
      'weigh-ins between 80 kg and 80 kg',
    )
  })

  it('lists weigh-ins newest first with their trend', () => {
    renderView(week)
    const rows = within(screen.getByRole('table', { name: text.history })).getAllByRole('row')
    expect(rows[1]).toHaveTextContent('Sat 21 Nov79 kg79.9 kg')
    expect(rows[2]).toHaveTextContent('Sat 14 Nov80 kg80 kg')
  })

  it('saves a weigh-in for today, and says it replaces one already saved', async () => {
    const { onSave } = renderView(week)
    expect(screen.getByText(text.replaces)).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText(text.weight('kg')), '78,6')
    await userEvent.click(screen.getByRole('button', { name: text.save }))

    expect(onSave).toHaveBeenCalledWith({ date: today, kg: 78.6 })
    expect(screen.getByRole('status')).toHaveTextContent(text.saved)
    expect(screen.getByLabelText(text.weight('kg'))).toHaveValue('')
  })

  it('refuses a weight out of range, naming the range in the unit shown', async () => {
    const { onSave } = renderView([], { unit: 'lb' })
    await userEvent.type(screen.getByLabelText(text.weight('lb')), '20')
    await userEvent.click(screen.getByRole('button', { name: text.save }))

    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByLabelText(text.weight('lb'))).toHaveAccessibleDescription(
      'Enter a weight between 44.1 lb and 881.8 lb.',
    )
  })

  it('reports a failed save', async () => {
    renderView([], {
      onSave: vi.fn(async () => {
        throw new Error('storage')
      }),
    })
    await userEvent.type(screen.getByLabelText(text.weight('kg')), '80')
    await userEvent.click(screen.getByRole('button', { name: text.save }))
    expect(screen.getByRole('alert')).toHaveTextContent(text.failed)
  })

  it('edits a listed weigh-in in place', async () => {
    const { onSave } = renderView(week)
    await userEvent.click(screen.getByRole('button', { name: text.edit('Sat 14 Nov') }))
    const dialog = screen.getByRole('dialog', { name: text.editTitle('Sat 14 Nov') })
    const field = within(dialog).getByLabelText(text.weight('kg'))
    expect(field).toHaveValue('80')

    await userEvent.clear(field)
    await userEvent.type(field, '80.5')
    await userEvent.click(within(dialog).getByRole('button', { name: text.save }))
    expect(onSave).toHaveBeenCalledWith({ date: '2026-11-14', kg: 80.5 })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows a pound weigh-in with one decimal when editing', async () => {
    renderView([{ date: today, kg: 81.65 }], { unit: 'lb' })
    await userEvent.click(screen.getByRole('button', { name: text.edit('Sat 21 Nov') }))
    expect(screen.getByRole('dialog').querySelector('input')).toHaveValue('180')
  })

  it('deletes a listed weigh-in', async () => {
    const { onRemove } = renderView(week)
    await userEvent.click(screen.getByRole('button', { name: text.edit('Sat 21 Nov') }))
    await userEvent.click(screen.getByRole('button', { name: text.remove }))
    expect(onRemove).toHaveBeenCalledWith(today)
  })
})
