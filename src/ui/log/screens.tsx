import { useState } from 'react'

import { useTargets } from '@/data/checkinHooks'
import { useFoods, useRecipes } from '@/data/foodHooks'
import type { LoggedEntry } from '@/data/log'
import {
  useBarcodeLookup,
  useCatalog,
  useDay,
  useLogActions,
  useMealCount,
  useQuickPicks,
} from '@/data/logHooks'
import { addDays, isDay } from '@/domain/dates'
import type { Meal } from '@/domain/nutrition'
import { strings } from '@/strings'

import { routeHref } from '../routes'
import { ScreenErrorBoundary } from '../ScreenErrorBoundary'
import { useToday } from '../useToday'
import { CopyDialog } from './CopyDialog'
import { EntryDialog } from './EntryDialog'
import { LogDay } from './LogDay'
import { LogPicker } from './LogPicker'

type Dialog =
  | { kind: 'none' }
  | { kind: 'add'; meal: Meal }
  | { kind: 'copy'; meal: Meal }
  | { kind: 'entry'; entry: LoggedEntry }

const Picker = ({
  date,
  meal,
  locale,
  onClose,
}: {
  date: string
  meal: Meal
  locale: string
  onClose: () => void
}) => {
  // Recent and most used are relative to the day being logged, not the device's date.
  const picks = useQuickPicks(date)
  const foods = useFoods()
  const recipes = useRecipes()
  const actions = useLogActions()
  // The built-in list loads on the first search, not when the picker opens.
  const [searched, setSearched] = useState(false)
  const builtIn = useCatalog(searched)
  const lookUp = useBarcodeLookup()
  return (
    <LogPicker
      meal={meal}
      picks={picks}
      foods={foods}
      recipes={recipes}
      builtIn={builtIn.state}
      onRetryBuiltIn={builtIn.retry}
      locale={locale}
      onPick={(source, servings) => actions.log({ date, meal }, source, servings)}
      onPickBuiltIn={(item, servings) => actions.logCatalog({ date, meal }, item, servings)}
      onSearch={() => setSearched(true)}
      onLookup={lookUp}
      onLogScanned={(foodId) => actions.logScanned({ date, meal }, foodId)}
      onLogNew={(input) => actions.logNew({ date, meal }, input)}
      onClose={onClose}
    />
  )
}

const Copy = ({
  date,
  into,
  locale,
  onClose,
}: {
  date: string
  into: Meal
  locale: string
  onClose: () => void
}) => {
  const actions = useLogActions()
  const [fromDate, setFromDate] = useState(addDays(date, -1))
  const [fromMeal, setFromMeal] = useState<Meal>(into)
  // A cleared or half-typed date counts nothing rather than querying an invalid day.
  const valid = isDay(fromDate)
  const count = useMealCount(valid ? fromDate : date, fromMeal)
  return (
    <CopyDialog
      into={into}
      date={fromDate}
      meal={fromMeal}
      onDateChange={setFromDate}
      onMealChange={setFromMeal}
      count={valid ? count : 0}
      problem={
        valid && fromDate > date
          ? strings.log.copy.future
          : fromDate === date && fromMeal === into
            ? strings.log.copy.sameMeal
            : null
      }
      locale={locale}
      onCopy={(from) => actions.copyMeal(from, { date, meal: into })}
      onClose={onClose}
    />
  )
}

const Day = ({ date, today, locale }: { date: string; today: string; locale: string }) => {
  const day = useDay(date)
  const targets = useTargets(date)
  const actions = useLogActions()
  const [dialog, setDialog] = useState<Dialog>({ kind: 'none' })
  const close = () => setDialog({ kind: 'none' })
  if (!day) return <p className="text-muted">{strings.loading}</p>

  return (
    <>
      <LogDay
        date={date}
        today={today}
        day={day}
        targets={targets}
        locale={locale}
        onAdd={(meal) => setDialog({ kind: 'add', meal })}
        onCopy={(meal) => setDialog({ kind: 'copy', meal })}
        onOpenEntry={(entry) => setDialog({ kind: 'entry', entry })}
        onSetComplete={(complete) => actions.setComplete(date, complete)}
      />
      {dialog.kind === 'add' && (
        <Picker date={date} meal={dialog.meal} locale={locale} onClose={close} />
      )}
      {dialog.kind === 'copy' && (
        <Copy date={date} into={dialog.meal} locale={locale} onClose={close} />
      )}
      {dialog.kind === 'entry' && (
        <EntryDialog
          entry={dialog.entry}
          locale={locale}
          onSave={(servings) => actions.changeServings(dialog.entry.id, servings)}
          onRemove={() => actions.remove(dialog.entry.id)}
          onClose={close}
        />
      )}
      <nav aria-label={strings.logLinks.label} className="mt-6 flex gap-3">
        <a
          href={routeHref({ tab: 'log', screen: 'foods' })}
          className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 font-medium"
        >
          {strings.logLinks.foods}
        </a>
        <a
          href={routeHref({ tab: 'log', screen: 'recipes' })}
          className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 font-medium"
        >
          {strings.logLinks.recipes}
        </a>
      </nav>
    </>
  )
}

// Loaded on demand from the shell, like the food screens. A date of null is today.
export const LogScreen = ({ date, locale }: { date: string | null; locale: string }) => {
  const today = useToday()
  const shown = date ?? today
  return (
    <ScreenErrorBoundary key={shown}>
      <Day date={shown} today={today} locale={locale} />
    </ScreenErrorBoundary>
  )
}
