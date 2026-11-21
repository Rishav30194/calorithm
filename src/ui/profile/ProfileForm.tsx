import { type FormEvent, type ReactNode, useId, useState } from 'react'

import type { SaveProfileResult } from '@/data/profile'
import { activityLevels } from '@/domain/maintenance'
import { EARLIEST_BIRTH_DATE, type ProfileSettings, proteinOptions } from '@/domain/profile'
import type { WeightUnit } from '@/domain/weight'
import { strings } from '@/strings'

import { TextField } from '../TextField'
import {
  type ProfileFormErrors,
  type ProfileFormValues,
  parseProfileForm,
  profileFormValues,
} from './parse'

type Props = {
  settings: ProfileSettings
  unit: WeightUnit
  today: string
  locale: string
  onSave: (settings: ProfileSettings, today: string) => Promise<SaveProfileResult>
}

type Status = 'idle' | 'busy' | 'saved' | 'failed' | 'offline' | 'signed_out'

const radioClass = 'size-5 accent-accent'
const choiceClass = 'flex min-h-11 items-center gap-3'

const Choices = ({
  legend,
  hint,
  children,
}: {
  legend: string
  hint?: string
  children: ReactNode
}) => {
  const hintId = useId()
  return (
    <fieldset className="flex flex-col gap-1" aria-describedby={hint ? hintId : undefined}>
      <legend className="mb-1 font-medium">{legend}</legend>
      {hint && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {children}
    </fieldset>
  )
}

// The profile the check-in reads. The parent remounts it with a `key` when the unit changes,
// since typed text means something else in another unit.
export const ProfileForm = ({ settings, unit, today, locale, onSave }: Props) => {
  const text = strings.profile
  const titleId = useId()
  const proteinId = useId()
  const [values, setValues] = useState<ProfileFormValues>(() =>
    profileFormValues(settings, unit, locale),
  )
  const [errors, setErrors] = useState<ProfileFormErrors>({})
  const [status, setStatus] = useState<Status>('idle')

  const set = <K extends keyof ProfileFormValues>(field: K, value: ProfileFormValues[K]) => {
    setValues((current) => ({ ...current, [field]: value }))
    setStatus('idle')
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const parsed = parseProfileForm(values, unit, today)
    if (!parsed.ok) {
      setErrors(parsed.errors)
      setStatus('idle')
      return
    }
    setErrors({})
    setStatus('busy')
    try {
      const result = await onSave(parsed.settings, today)
      if (result.ok) setStatus('saved')
      else if (result.reason === 'offline' || result.reason === 'signed_out')
        setStatus(result.reason)
      else setStatus('failed')
    } catch {
      setStatus('failed')
    }
  }

  const heightError = errors.height
    ? unit === 'kg'
      ? text.errors.heightCm
      : text.errors.heightImperial
    : undefined

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <h2 id={titleId} className="text-lg font-semibold">
        {text.title}
      </h2>
      <p className="text-muted">{text.intro}</p>
      <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
        {unit === 'kg' ? (
          <TextField
            label={text.heightCm}
            value={values.heightCm}
            onChange={(value) => set('heightCm', value)}
            inputMode="decimal"
            error={heightError}
          />
        ) : (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-medium">{text.height}</legend>
            <div className="grid grid-cols-2 gap-3">
              <TextField
                label={text.feet}
                value={values.heightFeet}
                onChange={(value) => set('heightFeet', value)}
                inputMode="numeric"
                error={heightError}
              />
              <TextField
                label={text.inches}
                value={values.heightInches}
                onChange={(value) => set('heightInches', value)}
                inputMode="numeric"
              />
            </div>
          </fieldset>
        )}

        <TextField
          label={text.birthDate}
          type="date"
          min={EARLIEST_BIRTH_DATE}
          max={today}
          value={values.birthDate}
          onChange={(value) => set('birthDate', value)}
          error={errors.birthDate ? text.errors.birthDate : undefined}
        />

        <Choices legend={text.sex} hint={text.sexHint}>
          {(['female', 'male'] as const).map((sex) => (
            <label key={sex} className={choiceClass}>
              <input
                type="radio"
                name="sex"
                value={sex}
                checked={values.sex === sex}
                onChange={() => set('sex', sex)}
                className={radioClass}
              />
              {text[sex]}
            </label>
          ))}
        </Choices>

        <Choices legend={text.activity}>
          {activityLevels.map((level) => (
            <label key={level} className={choiceClass}>
              <input
                type="radio"
                name="activity"
                value={level}
                checked={values.activityLevel === level}
                onChange={() => set('activityLevel', level)}
                className={radioClass}
              />
              {text.activityLevels[level]}
            </label>
          ))}
        </Choices>

        <Choices legend={text.goal} hint={text.goalHint}>
          {(['lose', 'maintain', 'gain'] as const).map((direction) => (
            <label key={direction} className={choiceClass}>
              <input
                type="radio"
                name="goal"
                value={direction}
                checked={values.goalDirection === direction}
                onChange={() => set('goalDirection', direction)}
                className={radioClass}
              />
              {text[direction]}
            </label>
          ))}
        </Choices>
        {values.goalDirection !== 'maintain' && (
          <TextField
            label={text.goalAmount(unit)}
            value={values.goalAmount}
            onChange={(value) => set('goalAmount', value)}
            inputMode="decimal"
            error={errors.goalRate ? text.errors.goalRate[unit] : undefined}
          />
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor={proteinId} className="font-medium">
            {text.protein}
          </label>
          <select
            id={proteinId}
            value={values.proteinGPerKg}
            onChange={(event) => set('proteinGPerKg', event.target.value)}
            aria-invalid={errors.protein ? true : undefined}
            className="min-h-11 rounded-lg border border-border bg-bg px-3 text-base"
          >
            {proteinOptions.map((option) => (
              <option key={option} value={String(option)}>
                {new Intl.NumberFormat(locale, {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                }).format(option)}
              </option>
            ))}
          </select>
          {errors.protein && <p className="text-sm text-danger">{text.errors.protein}</p>}
        </div>

        <TextField
          label={text.calorieFloor}
          hint={text.calorieFloorHint}
          value={values.calorieFloorKcal}
          onChange={(value) => set('calorieFloorKcal', value)}
          inputMode="numeric"
          error={errors.calorieFloor ? text.errors.calorieFloor : undefined}
        />

        <button
          type="submit"
          disabled={status === 'busy'}
          className="min-h-11 rounded-lg bg-accent px-4 font-semibold text-accent-text disabled:opacity-60"
        >
          {text.save}
        </button>
        <p role="status" className="min-h-6">
          {status === 'saved' ? text.saved : ''}
        </p>
        {(status === 'failed' || status === 'offline' || status === 'signed_out') && (
          <p role="alert" className="text-danger">
            {status === 'offline'
              ? text.offline
              : status === 'signed_out'
                ? strings.sync.signedOut
                : text.failed}
          </p>
        )}
      </form>
    </section>
  )
}
