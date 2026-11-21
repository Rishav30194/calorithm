import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { SaveProfileResult } from '@/data/profile'
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
}

const setup = (
  settings: ProfileSettings = defaults,
  unit: WeightUnit = 'kg',
  result: SaveProfileResult = { ok: true },
) => {
  const onSave = vi.fn(async () => result)
  render(
    <ProfileForm settings={settings} unit={unit} today={today} locale="en-GB" onSave={onSave} />,
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
