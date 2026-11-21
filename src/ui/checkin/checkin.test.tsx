import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { CheckinState } from '@/data/checkins'
import type { CheckinFields } from '@/domain/checkin'
import { strings } from '@/strings'

import { TargetProgress } from '../log/TargetProgress'
import { CheckinView } from './CheckinView'

const text = strings.checkin

const updated: CheckinFields = {
  date: '2026-11-21',
  status: 'updated',
  skipReason: null,
  method: 'adaptive',
  previousMaintenanceKcal: 2500,
  rawMaintenanceKcal: 2300,
  maintenanceKcal: 2400,
  kcalTarget: 1850,
  proteinTargetG: 147.6,
  trendWeightKg: 82,
  trendChangeKg: -1.2,
  windowDays: 28,
  completeDaysInWindow: 24,
  averageIntakeKcal: 2070,
  completeDaysInWeek: 6,
  goalRateRequestedKgPerWeek: -0.5,
  goalRateAppliedKgPerWeek: -0.5,
  proteinGPerKg: 1.8,
  calorieFloorKcal: 1200,
  floorApplied: false,
  rateCapped: false,
}

const skipped: CheckinFields = {
  ...updated,
  status: 'skipped',
  skipReason: 'too_few_complete_days',
  method: null,
  previousMaintenanceKcal: 2500,
  rawMaintenanceKcal: null,
  maintenanceKcal: 2500,
  trendChangeKg: null,
  windowDays: null,
  completeDaysInWindow: null,
  averageIntakeKcal: null,
  completeDaysInWeek: 2,
}

const due = (checkin: CheckinFields): CheckinState => ({
  latest: null,
  due: true,
  unit: 'kg',
  outcome: { kind: 'ready', checkin },
})

const setup = (state: CheckinState) => {
  const onSave = vi.fn(async () => {})
  render(<CheckinView state={state} locale="en-GB" onSave={onSave} />)
  return { onSave, user: userEvent.setup() }
}

describe('CheckinView', () => {
  it('shows the estimate, how it changed and was made, and the targets, then saves', async () => {
    const { onSave, user } = setup(due(updated))
    expect(screen.getByText(text.perDay('2,400 kcal'))).toBeInTheDocument()
    expect(screen.getByText(text.down('100 kcal', '2,500 kcal'))).toBeInTheDocument()
    expect(
      screen.getByText(text.adaptive('24', '28', text.trendDown('1.2 kg'))),
    ).toBeInTheDocument()
    expect(screen.getByText('1,850 kcal')).toBeInTheDocument()
    expect(screen.getByText('147.6 g')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: text.save }))
    expect(onSave).toHaveBeenCalledWith(updated)
    expect(await screen.findByRole('status')).toHaveTextContent(text.saved)
  })

  it('says a first estimate came from the formula', () => {
    setup(
      due({
        ...updated,
        method: 'formula',
        previousMaintenanceKcal: null,
        trendChangeKg: null,
        windowDays: null,
        completeDaysInWindow: null,
        averageIntakeKcal: null,
      }),
    )
    expect(screen.getByText(text.first)).toBeInTheDocument()
    expect(screen.getByText(text.formula)).toBeInTheDocument()
  })

  it('names each safety limit applied', () => {
    setup(
      due({
        ...updated,
        kcalTarget: 1200,
        floorApplied: true,
        goalRateRequestedKgPerWeek: -1,
        goalRateAppliedKgPerWeek: -0.82,
        rateCapped: true,
      }),
    )
    expect(screen.getByText(text.floorApplied('1,200 kcal'))).toBeInTheDocument()
    // Two decimals, as stored: 0.8 would read above 1% of an 81 kg trend.
    expect(screen.getByText(text.rateCapped('0.82 kg'))).toBeInTheDocument()
  })

  // Phase 5 criterion: a week with fewer than 4 complete days leaves targets unchanged and
  // says why.
  it('says why a skipped week leaves the targets unchanged', () => {
    setup(due(skipped))
    expect(screen.getByText(text.skipped('2'))).toBeInTheDocument()
    expect(screen.queryByText(text.estimate)).toBeNull()
    expect(screen.getByText('1,850 kcal')).toBeInTheDocument()
  })

  it('rounds a capped rate in pounds down, so it never reads above the cap', () => {
    setup({
      ...due({
        ...updated,
        goalRateRequestedKgPerWeek: -1,
        goalRateAppliedKgPerWeek: -0.82,
        rateCapped: true,
      }),
      unit: 'lb',
    })
    // 0.82 kg is 1.8078 lb.
    expect(screen.getByText(text.rateCapped('1.8 lb'))).toBeInTheDocument()
  })

  it('clears the saved message when a new check-in becomes due', async () => {
    const onSave = vi.fn(async () => {})
    const { rerender } = render(<CheckinView state={due(updated)} locale="en-GB" onSave={onSave} />)
    await userEvent.setup().click(screen.getByRole('button', { name: text.save }))
    expect(await screen.findByRole('status')).toHaveTextContent(text.saved)

    rerender(
      <CheckinView
        state={due({ ...updated, date: '2026-11-28' })}
        locale="en-GB"
        onSave={onSave}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('')
  })

  it('points to what a blocked check-in needs', () => {
    setup({
      latest: null,
      due: true,
      unit: 'kg',
      outcome: { kind: 'blocked', reason: 'no_weigh_ins' },
    })
    expect(screen.getByText(text.noWeighIns)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: text.goToWeight })).toHaveAttribute('href', '#/weight')
  })

  it('shows the last check-in and when the next is due, with nothing to save', () => {
    setup({ latest: updated, due: false, unit: 'kg', outcome: null })
    expect(screen.getByText(text.last('21 November 2026'), { exact: false })).toBeInTheDocument()
    expect(screen.getByText(text.next('28 November 2026'), { exact: false })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: text.save })).toBeNull()
  })
})

describe('TargetProgress', () => {
  it('shows the day’s intake against each target', () => {
    render(
      <TargetProgress
        total={{ kcal: 950, proteinG: 80.5 }}
        targets={{ kcal: 1900, proteinG: 147.6 }}
        locale="en-GB"
      />,
    )
    expect(screen.getByText(strings.targets.progress('950 kcal', '1,900 kcal'))).toBeInTheDocument()
    expect(screen.getByText(strings.targets.progress('80.5 g', '147.6 g'))).toBeInTheDocument()
  })

  it('points to the check-in before the first one', () => {
    render(<TargetProgress total={{ kcal: 0, proteinG: 0 }} targets={null} locale="en-GB" />)
    expect(screen.getByRole('link', { name: strings.targets.goToCheckin })).toHaveAttribute(
      'href',
      '#/checkin',
    )
  })
})
