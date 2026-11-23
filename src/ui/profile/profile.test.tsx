import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { SaveProfileResult } from '@/data/profile'
import type { WeekPlan } from '@/domain/calorieDays'
import type { ProfileSettings } from '@/domain/profile'
import type { WeightUnit } from '@/domain/weight'
import { strings } from '@/strings'

import { ProfileForm } from './ProfileForm'

const text = strings.profile
const today = '2026-11-21'

const defaults: ProfileSettings = {
  heightCm: null,
  birthDate: null,
  sex: null,
  activityLevel: null,
  goalRateKgPerWeek: 0,
  proteinGPerKg: 1.8,
  calorieFloorKcal: 1200,
  calorieDays: null,
}

const setup = (
  settings: ProfileSettings = defaults,
  unit: WeightUnit = 'kg',
  result: SaveProfileResult = { ok: true },
  plan: WeekPlan | null = null,
) => {
  const onSave = vi.fn(async () => result)
  render(
    <ProfileForm
      settings={settings}
      unit={unit}
      today={today}
      locale="en-GB"
      plan={plan}
      onSave={onSave}
    />,
  )
  return { onSave, user: userEvent.setup() }
}

describe('ProfileForm', () => {
  it('saves every field in stored units', async () => {
    const { onSave, user } = setup()
    await user.type(screen.getByLabelText(text.heightCm), '172.5')
    await user.type(screen.getByLabelText(text.birthDate), '1990-04-12')
    await user.click(screen.getByLabelText(text.female))
    await user.click(screen.getByLabelText(text.activityLevels.light))
    await user.click(screen.getByLabelText(text.lose))
    await user.type(screen.getByLabelText(text.goalAmount('kg')), '0.4')
    await user.selectOptions(screen.getByLabelText(text.protein), '2')
    await user.clear(screen.getByLabelText(text.calorieFloor))
    await user.type(screen.getByLabelText(text.calorieFloor), '1400')
    await user.click(screen.getByRole('button', { name: text.save }))

    expect(onSave).toHaveBeenCalledWith(
      {
        heightCm: 172.5,
        birthDate: '1990-04-12',
        sex: 'female',
        activityLevel: 'light',
        goalRateKgPerWeek: -0.4,
        proteinGPerKg: 2,
        calorieFloorKcal: 1400,
      },
      today,
    )
    expect(await screen.findByRole('status')).toHaveTextContent(text.saved)
  })

  it('shows stored settings, with height in feet and inches for imperial', () => {
    setup(
      {
        ...defaults,
        heightCm: 177.8,
        sex: 'male',
        activityLevel: 'active',
        goalRateKgPerWeek: -0.45,
      },
      'lb',
    )
    expect(screen.getByLabelText(text.feet)).toHaveValue('5')
    expect(screen.getByLabelText(text.inches)).toHaveValue('10')
    expect(screen.getByLabelText(text.male)).toBeChecked()
    expect(screen.getByLabelText(text.activityLevels.active)).toBeChecked()
    expect(screen.getByLabelText(text.lose)).toBeChecked()
    expect(screen.getByLabelText(text.goalAmount('lb'))).toHaveValue('1')
    expect(screen.queryByLabelText(text.heightCm)).toBeNull()
  })

  it('hides the amount while keeping the weight', async () => {
    const { user } = setup({ ...defaults, goalRateKgPerWeek: 0.25 })
    expect(screen.getByLabelText(text.goalAmount('kg'))).toHaveValue('0.25')
    await user.click(screen.getByLabelText(text.maintain))
    expect(screen.queryByLabelText(text.goalAmount('kg'))).toBeNull()
  })

  it('names each field the database would refuse, and saves nothing', async () => {
    const { onSave, user } = setup()
    await user.type(screen.getByLabelText(text.heightCm), '300')
    await user.click(screen.getByLabelText(text.gain))
    await user.clear(screen.getByLabelText(text.calorieFloor))
    await user.type(screen.getByLabelText(text.calorieFloor), '800')
    await user.click(screen.getByRole('button', { name: text.save }))

    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByLabelText(text.heightCm)).toHaveAccessibleDescription(text.errors.heightCm)
    expect(screen.getByLabelText(text.goalAmount('kg'))).toHaveAccessibleDescription(
      text.errors.goalRate.kg,
    )
    expect(screen.getByLabelText(text.calorieFloor)).toHaveAccessibleDescription(
      `${text.calorieFloorHint} ${text.errors.calorieFloor}`,
    )
  })

  it('saves only the fields changed since it opened or last saved', async () => {
    const { onSave, user } = setup({ ...defaults, heightCm: 180, activityLevel: 'light' })
    await user.clear(screen.getByLabelText(text.calorieFloor))
    await user.type(screen.getByLabelText(text.calorieFloor), '1500')
    await user.click(screen.getByRole('button', { name: text.save }))
    expect(onSave).toHaveBeenLastCalledWith({ calorieFloorKcal: 1500 }, today)

    await screen.findByText(text.saved)
    await user.click(screen.getByLabelText(text.activityLevels.active))
    await user.click(screen.getByRole('button', { name: text.save }))
    expect(onSave).toHaveBeenLastCalledWith({ activityLevel: 'active' }, today)
  })

  it('marks both height fields invalid in imperial, with one message', async () => {
    const { user } = setup(defaults, 'lb')
    await user.type(screen.getByLabelText(text.feet), '5')
    await user.type(screen.getByLabelText(text.inches), '12')
    await user.click(screen.getByRole('button', { name: text.save }))

    for (const label of [text.feet, text.inches]) {
      expect(screen.getByLabelText(label)).toHaveAttribute('aria-invalid', 'true')
      expect(screen.getByLabelText(label)).toHaveAccessibleDescription(text.errors.heightImperial)
    }
    expect(screen.getAllByText(text.errors.heightImperial)).toHaveLength(1)
  })

  it('says why a save was refused while offline', async () => {
    const { user } = setup(defaults, 'kg', { ok: false, reason: 'offline' })
    await user.click(screen.getByRole('button', { name: text.save }))
    expect(await screen.findByRole('alert')).toHaveTextContent(text.offline)
  })
})

// Phase 19 (decision 0033).
describe('ProfileForm higher-calorie days', () => {
  const plan: WeekPlan = {
    kcalTarget: 2000,
    proteinTargetG: 150,
    floorKcal: 1200,
    calorieDays: { days: 0, extraKcal: 0 },
  }

  it('previews the week and saves the chosen days and extra', async () => {
    const { onSave, user } = setup(defaults, 'kg', { ok: true }, plan)
    await user.click(screen.getByRole('checkbox', { name: 'Saturday' }))
    await user.click(screen.getByRole('checkbox', { name: 'Sunday' }))
    await user.type(screen.getByLabelText(text.higherExtra), '400')

    const week = screen.getByRole('region', { name: text.week })
    expect(week).toHaveTextContent('Mon1,840 kcal')
    expect(week).toHaveTextContent('Sat2,400 kcal')

    await user.click(screen.getByRole('button', { name: text.save }))
    expect(onSave).toHaveBeenCalledWith({ calorieDays: { days: 96, extraKcal: 400 } }, today)
  })

  it('refuses more extra than the calorie floor allows, and says how much it can be', async () => {
    const { onSave, user } = setup(defaults, 'kg', { ok: true }, plan)
    await user.click(screen.getByRole('checkbox', { name: 'Saturday' }))
    await user.click(screen.getByRole('checkbox', { name: 'Sunday' }))
    const extra = screen.getByLabelText(text.higherExtra)
    // Five days with 800 kcal above the floor give 4000, shared by two days.
    await user.type(extra, '2001')
    await user.click(screen.getByRole('button', { name: text.save }))

    expect(onSave).not.toHaveBeenCalled()
    expect(extra).toHaveAccessibleDescription(text.errors.calorieDaysMax('2,000 kcal'))
  })

  it('keeps the seventh day from being picked', async () => {
    const { user } = setup(defaults, 'kg', { ok: true }, plan)
    for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']) {
      await user.click(screen.getByRole('checkbox', { name: day }))
    }
    expect(screen.getByRole('checkbox', { name: 'Sunday' })).toBeDisabled()
  })

  it('says the week shows after the first check-in', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('checkbox', { name: 'Saturday' }))
    expect(screen.getByRole('region', { name: text.week })).toHaveTextContent(text.weekLater)
  })
})
