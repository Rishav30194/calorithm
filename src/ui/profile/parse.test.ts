import { describe, expect, it } from 'vitest'

import { type ProfileFormValues, parseProfileForm, profileFormValues } from './parse'

const today = '2026-11-21'

const metric: ProfileFormValues = {
  heightCm: '180',
  heightFeet: '',
  heightInches: '',
  birthDate: '1996-06-01',
  sex: 'male',
  activityLevel: 'moderate',
  goalDirection: 'lose',
  goalAmount: '0.5',
  proteinGPerKg: '1.8',
  calorieFloorKcal: '1200',
}

const imperial: ProfileFormValues = {
  ...metric,
  heightCm: '',
  heightFeet: '5',
  heightInches: '10',
  goalAmount: '1',
}

// Nothing shown, so every filled field counts as a change.
const blank: ProfileFormValues = {
  heightCm: '',
  heightFeet: '',
  heightInches: '',
  birthDate: '',
  sex: '',
  activityLevel: '',
  goalDirection: 'maintain',
  goalAmount: '',
  proteinGPerKg: '',
  calorieFloorKcal: '',
}

describe('parseProfileForm', () => {
  it('reads metric values into stored units', () => {
    expect(parseProfileForm(metric, blank, 'kg', today)).toEqual({
      ok: true,
      changes: {
        heightCm: 180,
        birthDate: '1996-06-01',
        sex: 'male',
        activityLevel: 'moderate',
        goalRateKgPerWeek: -0.5,
        proteinGPerKg: 1.8,
        calorieFloorKcal: 1200,
      },
    })
  })

  it('reads feet, inches, and pounds a week into centimeters and kilograms', () => {
    expect(parseProfileForm(imperial, blank, 'lb', today)).toMatchObject({
      ok: true,
      changes: { heightCm: 177.8, goalRateKgPerWeek: -0.45 },
    })
    expect(parseProfileForm({ ...imperial, heightInches: '' }, blank, 'lb', today)).toMatchObject({
      changes: { heightCm: 152.4 },
    })
  })

  it('returns only the fields that differ from what was shown', () => {
    expect(parseProfileForm(metric, metric, 'kg', today)).toEqual({ ok: true, changes: {} })
    expect(parseProfileForm({ ...metric, calorieFloorKcal: '1500' }, metric, 'kg', today)).toEqual({
      ok: true,
      changes: { calorieFloorKcal: 1500 },
    })
    // Height is one change whichever of its fields moved.
    expect(parseProfileForm({ ...imperial, heightInches: '11' }, imperial, 'lb', today)).toEqual({
      ok: true,
      changes: { heightCm: 180.3 },
    })
  })

  it('leaves an untouched field alone, even one that wouldn’t parse as shown', () => {
    // A stored −0.02 kg a week shows as Lose with an amount of 0 lb.
    const shown = { ...imperial, goalAmount: '0' }
    expect(parseProfileForm({ ...shown, calorieFloorKcal: '1400' }, shown, 'lb', today)).toEqual({
      ok: true,
      changes: { calorieFloorKcal: 1400 },
    })
  })

  it('leaves empty body fields unset', () => {
    const empty = { ...metric, heightCm: '', birthDate: '', sex: '', activityLevel: '' } as const
    expect(parseProfileForm(empty, metric, 'kg', today)).toEqual({
      ok: true,
      changes: { heightCm: null, birthDate: null, sex: null, activityLevel: null },
    })
  })

  it('ignores the amount when maintaining', () => {
    expect(
      parseProfileForm(
        { ...metric, goalDirection: 'maintain', goalAmount: '' },
        metric,
        'kg',
        today,
      ),
    ).toEqual({ ok: true, changes: { goalRateKgPerWeek: 0 } })
  })

  it('rounds a height in centimeters to one decimal, as stored', () => {
    expect(parseProfileForm({ ...metric, heightCm: '180,25' }, metric, 'kg', today)).toEqual({
      ok: true,
      changes: { heightCm: 180.3 },
    })
  })

  it.each([
    ['height', { heightCm: '99' }, 'kg'],
    ['height', { heightCm: 'tall' }, 'kg'],
    ['height', { heightCm: '', heightFeet: '', heightInches: '10' }, 'lb'],
    ['height', { heightCm: '', heightFeet: '5', heightInches: '12' }, 'lb'],
    ['height', { heightCm: '', heightFeet: '5.5', heightInches: '' }, 'lb'],
    ['height', { heightCm: '', heightFeet: '9', heightInches: '' }, 'lb'],
    ['birthDate', { birthDate: '2026-11-22' }, 'kg'],
    ['birthDate', { birthDate: today }, 'kg'],
    ['birthDate', { birthDate: '1899-12-31' }, 'kg'],
    ['goalRate', { goalAmount: '' }, 'kg'],
    ['goalRate', { goalAmount: '0' }, 'kg'],
    ['goalRate', { goalAmount: '2.5' }, 'kg'],
    ['goalRate', { goalAmount: '4.5' }, 'lb'],
    // Rounds to 0 kg, which would save as keeping the weight.
    ['goalRate', { goalAmount: '0.01' }, 'lb'],
    ['calorieFloor', { calorieFloorKcal: '999' }, 'kg'],
    ['calorieFloor', { calorieFloorKcal: '1200.5' }, 'kg'],
    ['calorieFloor', { calorieFloorKcal: '' }, 'kg'],
    ['protein', { proteinGPerKg: '2.5' }, 'kg'],
  ] as const)('flags %s for %o in %s', (field, change, unit) => {
    const base = unit === 'kg' ? metric : imperial
    expect(parseProfileForm({ ...base, ...change }, base, unit, today)).toEqual({
      ok: false,
      errors: { [field]: true },
    })
  })
})

describe('profileFormValues', () => {
  it('shows stored settings in the form, in the profile’s units', () => {
    const settings = {
      heightCm: 177.8,
      birthDate: '1996-06-01',
      sex: 'male',
      activityLevel: 'moderate',
      goalRateKgPerWeek: -0.45,
      proteinGPerKg: 1.8,
      calorieFloorKcal: 1200,
    } as const
    expect(profileFormValues(settings, 'lb', 'en-US')).toEqual({
      ...imperial,
      heightCm: '177.8',
      heightFeet: '5',
      heightInches: '10',
    })
    expect(profileFormValues(settings, 'kg', 'de-DE')).toMatchObject({
      heightCm: '177,8',
      goalDirection: 'lose',
      goalAmount: '0,45',
    })
  })

  it('round-trips through the parser', () => {
    const settings = {
      heightCm: 165.5,
      birthDate: null,
      sex: null,
      activityLevel: 'light',
      goalRateKgPerWeek: 0,
      proteinGPerKg: 2.1,
      calorieFloorKcal: 1500,
    } as const
    expect(
      parseProfileForm(profileFormValues(settings, 'kg', 'en-US'), blank, 'kg', today),
    ).toEqual({
      ok: true,
      changes: {
        heightCm: 165.5,
        activityLevel: 'light',
        proteinGPerKg: 2.1,
        calorieFloorKcal: 1500,
      },
    })
  })
})
