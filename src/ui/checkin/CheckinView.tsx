import { useEffect, useState } from 'react'

import type { CheckinState } from '@/data/checkins'
import type { CheckinFields } from '@/domain/checkin'
import { addDays } from '@/domain/dates'
import { strings } from '@/strings'

import { routeHref } from '../routes'
import { CheckinSummary } from './CheckinSummary'

type Props = {
  state: CheckinState
  locale: string
  onSave: (checkin: CheckinFields) => Promise<void>
}

const longDate = (date: string, locale: string): string => {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number)
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(
    new Date(year, month - 1, day),
  )
}

const linkClass =
  'inline-flex min-h-11 items-center self-start rounded-lg border border-border px-4 font-medium'

export const CheckinView = ({ state, locale, onSave }: Props) => {
  const text = strings.checkin
  const [status, setStatus] = useState<'idle' | 'busy' | 'saved' | 'failed'>('idle')
  const { latest, outcome, unit } = state
  // A new check-in becoming due, such as on the next day, clears the last save's message.
  const dueDate = outcome?.kind === 'ready' ? outcome.checkin.date : null
  useEffect(() => {
    if (dueDate !== null) setStatus('idle')
  }, [dueDate])

  const save = async (checkin: CheckinFields) => {
    setStatus('busy')
    try {
      await onSave(checkin)
      setStatus('saved')
    } catch {
      setStatus('failed')
    }
  }

  const body = () => {
    if (outcome?.kind === 'blocked') {
      const noWeighIns = outcome.reason === 'no_weigh_ins'
      return (
        <>
          <p>{noWeighIns ? text.noWeighIns : text.profileIncomplete}</p>
          <a
            href={routeHref(
              noWeighIns
                ? { tab: 'weight', screen: 'weight' }
                : { tab: 'settings', screen: 'settings' },
            )}
            className={linkClass}
          >
            {noWeighIns ? text.goToWeight : text.goToSettings}
          </a>
        </>
      )
    }
    if (outcome?.kind === 'ready') {
      return (
        <>
          <p>{text.due}</p>
          <CheckinSummary checkin={outcome.checkin} unit={unit} locale={locale} />
          <button
            type="button"
            onClick={() => void save(outcome.checkin)}
            disabled={status === 'busy'}
            className="min-h-11 rounded-lg bg-accent px-4 font-semibold text-accent-text disabled:opacity-60"
          >
            {status === 'busy' ? text.saving : text.save}
          </button>
        </>
      )
    }
    // Not due, so there's a check-in in the last 7 days.
    if (latest === null) return null
    return (
      <>
        <div className="text-muted">
          <p>{text.last(longDate(latest.date, locale))}</p>
          <p>{text.next(longDate(addDays(latest.date, 7), locale))}</p>
        </div>
        <CheckinSummary checkin={latest} unit={unit} locale={locale} />
      </>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">{text.title}</h2>
      {body()}
      <p role="status" className="min-h-6">
        {status === 'saved' ? text.saved : ''}
      </p>
      {status === 'failed' && (
        <p role="alert" className="text-danger">
          {text.failed}
        </p>
      )}
    </div>
  )
}
