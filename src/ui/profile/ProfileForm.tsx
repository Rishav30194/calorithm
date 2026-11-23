import { type FormEvent, type ReactNode, useId, useState } from 'react'

import type { SaveProfileResult } from '@/data/profile'
import {
  higherDayCount,
  MAX_HIGHER_DAYS,
  maxExtraKcal,
  type WeekPlan,
  weekTargets,
} from '@/domain/calorieDays'
import { addDays } from '@/domain/dates'
import { formatKcal } from '@/domain/format'
import { activityLevels } from '@/domain/maintenance'
import { EARLIEST_BIRTH_DATE, type ProfileSettings, proteinOptions } from '@/domain/profile'
import type { WeightUnit } from '@/domain/weight'
import { strings } from '@/strings'

import { weekdayNames } from '../dates'
import { TextField } from '../TextField'
import { WeekTargets } from '../WeekTargets'
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
  // The latest check-in's targets and the setting, for the week preview; null before the
  // first check-in.
  plan: WeekPlan | null
  onSave: (changes: Partial<ProfileSettings>, today: string) => Promise<SaveProfileResult>
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
export const ProfileForm = ({ settings, unit, today, locale, plan, onSave }: Props) => {
  const text = strings.profile
  const titleId = useId()
  const proteinId = useId()
  const heightErrorId = useId()
  // What the form showed when opened or last saved; only fields that differ from it are saved.
  const [shown, setShown] = useState<ProfileFormValues>(() =>
    profileFormValues(settings, unit, locale),
  )
  const [values, setValues] = useState<ProfileFormValues>(shown)
  const [errors, setErrors] = useState<ProfileFormErrors>({})
  const [status, setStatus] = useState<Status>('idle')
  // Set when the extra is more than the calorie floor allows at the latest target.
  const [daysLimit, setDaysLimit] = useState<number | null>(null)

  const set = <K extends keyof ProfileFormValues>(field: K, value: ProfileFormValues[K]) => {
    setValues((current) => ({ ...current, [field]: value }))
    setStatus('idle')
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const parsed = parseProfileForm(values, shown, unit, today)
    if (!parsed.ok) {
      setErrors(parsed.errors)
      setDaysLimit(null)
      setStatus('idle')
      return
    }
    // A new floor can also leave the saved extra too large, so either change is checked.
    const { calorieDays, calorieFloorKcal } = parsed.changes
    const days = calorieDays ?? settings.calorieDays
    const allowed = allowedExtra(calorieFloorKcal)
    const checked = calorieDays !== undefined || calorieFloorKcal !== undefined
    if (checked && days && allowed !== null && days.extraKcal > allowed) {
      setErrors({ calorieDays: true })
      setDaysLimit(allowed)
      setStatus('idle')
      return
    }
    setErrors({})
    setDaysLimit(null)
    setStatus('busy')
    try {
      const result = await onSave(parsed.changes, today)
      if (result.ok) {
        setShown(values)
        setStatus('saved')
      } else if (result.reason === 'offline' || result.reason === 'signed_out')
        setStatus(result.reason)
      else setStatus('failed')
    } catch {
      setStatus('failed')
    }
  }

  // The floor the targets will use: the plan's (the higher of the check-in's and the saved
  // profile's), or a new one typed above it.
  const floorNow = (floor: number | undefined): number =>
    Math.max(plan?.floorKcal ?? settings.calorieFloorKcal, floor ?? 0)
  // The most extra the floor allows at the latest target, or null before the first check-in.
  const allowedExtra = (floor: number | undefined): number | null =>
    plan === null
      ? null
      : maxExtraKcal(plan.kcalTarget, floorNow(floor), higherDayCount(values.higherDays))

  const toggleDay = (weekday: number) => set('higherDays', values.higherDays ^ (1 << weekday))

  const extra = Number(values.higherExtra)
  const typedExtra = values.higherDays !== 0 && Number.isInteger(extra) && extra > 0
  const preview =
    plan !== null && typedExtra
      ? weekTargets(plan.kcalTarget, floorNow(undefined), {
          days: values.higherDays,
          extraKcal: extra,
        })
      : null
  // While typing, before any save: the preview shows the trimmed week, so say why.
  const previewLimit = preview?.trimmed ? allowedExtra(undefined) : null
  const daysError = errors.calorieDays
    ? daysLimit === null
      ? text.errors.calorieDays
      : daysLimit === 0
        ? text.errors.calorieDaysNone
        : text.errors.calorieDaysMax(formatKcal(daysLimit, locale))
    : undefined
  const chosen = higherDayCount(values.higherDays)

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
                invalid={heightError !== undefined}
                describedBy={heightError ? heightErrorId : undefined}
              />
              <TextField
                label={text.inches}
                value={values.heightInches}
                onChange={(value) => set('heightInches', value)}
                inputMode="numeric"
                invalid={heightError !== undefined}
                describedBy={heightError ? heightErrorId : undefined}
              />
            </div>
            {heightError && (
              <p id={heightErrorId} className="text-sm text-danger">
                {heightError}
              </p>
            )}
          </fieldset>
        )}

        <TextField
          label={text.birthDate}
          type="date"
          min={EARLIEST_BIRTH_DATE}
          max={addDays(today, -1)}
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

        <Choices legend={text.higherDays} hint={text.higherDaysHint}>
          {weekdayNames(locale).map((name, weekday) => {
            const checked = (values.higherDays & (1 << weekday)) !== 0
            return (
              <label key={name} className={choiceClass}>
                <input
                  type="checkbox"
                  checked={checked}
                  // At least one day must give, so the seventh can't be picked.
                  disabled={!checked && chosen >= MAX_HIGHER_DAYS}
                  onChange={() => toggleDay(weekday)}
                  className={radioClass}
                />
                {name}
              </label>
            )
          })}
        </Choices>
        {values.higherDays !== 0 && (
          <>
            <TextField
              label={text.higherExtra}
              value={values.higherExtra}
              onChange={(value) => set('higherExtra', value)}
              inputMode="numeric"
              error={daysError}
            />
            <section aria-label={text.week} className="flex flex-col gap-1">
              <h3 className="font-medium">{text.week}</h3>
              {plan === null ? (
                <p className="text-sm text-muted">{text.weekLater}</p>
              ) : (
                preview && (
                  <>
                    <WeekTargets kcal={preview.kcal} locale={locale} />
                    {previewLimit !== null && (
                      <p className="text-sm text-muted">
                        {previewLimit === 0
                          ? text.errors.calorieDaysNone
                          : text.errors.calorieDaysMax(formatKcal(previewLimit, locale))}
                      </p>
                    )}
                  </>
                )
              )}
            </section>
          </>
        )}

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
