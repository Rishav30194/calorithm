import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import type { FoodView, RecipeView } from '@/data/foods'
import type { LoggedEntry, QuickPicks } from '@/data/log'
import type { DayView } from '@/data/logHooks'
import { strings } from '@/strings'

import { CopyDialog } from './CopyDialog'
import { EntryDialog } from './EntryDialog'
import { dayTitle, LogDay } from './LogDay'
import { LogPicker } from './LogPicker'

// jsdom has no modal dialogs; the browser tests cover the real focus handling.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false
  }
})

const text = strings.log

const oats: FoodView = {
  id: 'f1',
  name: 'Oats',
  servingSize: 40,
  servingUnit: 'g',
  kcal: 150,
  proteinG: 5,
  archived: false,
  carbsG: null,
  fatG: null,
}
const butter: FoodView = { ...oats, id: 'f2', name: 'Butter', archived: true }
const chili: RecipeView = {
  id: 'r1',
  name: 'Chili',
  servings: 4,
  archived: false,
  totals: { kcal: 2000, proteinG: 120, carbsG: null, fatG: null },
  perServing: { kcal: 500, proteinG: 30, carbsG: null, fatG: null },
  missingCarbsOrFat: true,
}
const picks: QuickPicks = {
  today: [],
  yesterday: [{ source: { kind: 'food', id: 'f1' }, name: 'Oats', servings: 2, count: 1 }],
  mostUsed: [],
}

const entry = (overrides: Partial<LoggedEntry> = {}): LoggedEntry => ({
  id: 'e1',
  date: '2026-11-21',
  meal: 'breakfast',
  source: { kind: 'food', id: 'f1' },
  name: 'Oats',
  servings: 2,
  kcal: 300,
  proteinG: 10,
  carbsG: 54,
  fatG: 5,
  ...overrides,
})

const emptyMeals = { breakfast: [], lunch: [], dinner: [], snacks: [] }
const zero = { kcal: 0, proteinG: 0, carbsG: null, fatG: null }

describe('LogPicker', () => {
  const renderPicker = (onPick = vi.fn(async () => true), onClose = vi.fn()) => {
    render(
      <LogPicker
        meal="breakfast"
        isToday
        picks={picks}
        foods={[oats, butter]}
        recipes={[chili]}
        locale="en-US"
        onPick={onPick}
        onClose={onClose}
      />,
    )
    return { onPick, onClose }
  }

  it('logs a quick pick with the servings last logged, in one tap, then closes', async () => {
    const { onPick, onClose } = renderPicker()
    const yesterday = screen
      .getByRole('heading', { name: text.picker.yesterday })
      .closest('section')
    if (!yesterday) throw new Error('no yesterday section')

    await userEvent.click(within(yesterday).getByRole('button', { name: /Oats/ }))

    expect(onPick).toHaveBeenCalledWith({ kind: 'food', id: 'f1' }, 2)
    expect(onClose).toHaveBeenCalled()
  })

  it('logs one serving from search, and leaves archived foods out', async () => {
    const { onPick } = renderPicker()
    await userEvent.type(screen.getByLabelText(text.picker.search), 'chi')

    expect(screen.queryByRole('button', { name: /Butter/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Chili/ }))

    expect(onPick).toHaveBeenCalledWith({ kind: 'recipe', id: 'r1' }, 1)
  })

  it('reports a failed log and stays open', async () => {
    const { onClose } = renderPicker(vi.fn(async () => false))
    await userEvent.type(screen.getByLabelText(text.picker.search), 'Oats')

    await userEvent.click(screen.getByRole('button', { name: /Oats/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent(text.picker.failed)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('names the first rows after the day being logged when it isn’t today', () => {
    render(
      <LogPicker
        meal="lunch"
        isToday={false}
        picks={picks}
        foods={[oats]}
        recipes={[]}
        locale="en-US"
        onPick={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByRole('heading', { name: text.picker.dayBefore })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: text.picker.yesterday })).not.toBeInTheDocument()
  })

  it('shows loading, then the empty state when nothing is saved', () => {
    const { rerender } = render(
      <LogPicker
        meal="lunch"
        isToday
        picks={undefined}
        foods={undefined}
        recipes={undefined}
        locale="en-US"
        onPick={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText(strings.loading)).toBeInTheDocument()

    rerender(
      <LogPicker
        meal="lunch"
        isToday
        picks={{ today: [], yesterday: [], mostUsed: [] }}
        foods={[]}
        recipes={[]}
        locale="en-US"
        onPick={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText(text.picker.empty)).toBeInTheDocument()
  })
})

describe('EntryDialog', () => {
  it('saves parsed servings, rejects bad ones, and removes', async () => {
    const onSave = vi.fn(async () => true)
    const onRemove = vi.fn(async () => {})
    render(
      <EntryDialog
        entry={entry()}
        locale="en-US"
        onSave={onSave}
        onRemove={onRemove}
        onClose={vi.fn()}
      />,
    )
    const field = screen.getByLabelText(text.entry.servings)
    expect(field).toHaveValue('2')

    await userEvent.clear(field)
    await userEvent.type(field, '0')
    await userEvent.click(screen.getByRole('button', { name: text.entry.save }))
    expect(onSave).not.toHaveBeenCalled()
    expect(field).toHaveAccessibleDescription(strings.recipes.errors.itemServings)

    await userEvent.clear(field)
    await userEvent.type(field, '1,5')
    await userEvent.click(screen.getByRole('button', { name: text.entry.save }))
    expect(onSave).toHaveBeenCalledWith(1.5)

    await userEvent.click(screen.getByRole('button', { name: text.entry.remove }))
    expect(onRemove).toHaveBeenCalled()
  })
})

describe('EntryDialog with a missing entry', () => {
  it('says the save failed instead of closing', async () => {
    const onClose = vi.fn()
    render(
      <EntryDialog
        entry={entry()}
        locale="en-US"
        onSave={async () => false}
        onRemove={vi.fn()}
        onClose={onClose}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: text.entry.save }))

    expect(await screen.findByRole('alert')).toHaveTextContent(text.entry.failed)
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('CopyDialog', () => {
  const renderCopy = (
    count: number | undefined,
    onCopy = vi.fn(async () => count ?? 0),
    problem: string | null = null,
  ) => {
    render(
      <CopyDialog
        into="lunch"
        date="2026-11-20"
        meal="lunch"
        onDateChange={vi.fn()}
        onMealChange={vi.fn()}
        count={count}
        problem={problem}
        locale="en-US"
        onCopy={onCopy}
        onClose={vi.fn()}
      />,
    )
    return onCopy
  }

  it('says how many entries it will copy, then copies them', async () => {
    const onCopy = renderCopy(3)
    expect(screen.getByText(text.copy.count('3', false))).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: text.copy.copy }))

    expect(onCopy).toHaveBeenCalledWith({ date: '2026-11-20', meal: 'lunch' })
  })

  it('explains why the chosen day and meal can’t be copied, and disables Copy', () => {
    renderCopy(3, undefined, text.copy.sameMeal)
    expect(screen.getByText(text.copy.sameMeal)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: text.copy.copy })).toBeDisabled()
  })

  it('says so when the meal emptied before the copy ran', async () => {
    renderCopy(
      2,
      vi.fn(async () => 0),
    )

    await userEvent.click(screen.getByRole('button', { name: text.copy.copy }))

    expect(await screen.findByRole('alert')).toHaveTextContent(text.copy.none)
  })

  it('disables Copy when the meal is empty', () => {
    renderCopy(0)
    expect(screen.getByText(text.copy.none)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: text.copy.copy })).toBeDisabled()
  })
})

describe('LogDay', () => {
  const day: DayView = {
    byMeal: { ...emptyMeals, breakfast: [entry()] },
    mealTotals: {
      breakfast: { kcal: 300, proteinG: 10, carbsG: 54, fatG: 5 },
      lunch: zero,
      dinner: zero,
      snacks: zero,
    },
    total: { kcal: 300, proteinG: 10, carbsG: 54, fatG: 5 },
    complete: false,
  }

  const renderDay = (onSetComplete = vi.fn(async () => {})) => {
    const handlers = { onAdd: vi.fn(), onCopy: vi.fn(), onOpenEntry: vi.fn(), onSetComplete }
    render(<LogDay date="2026-11-21" today="2026-11-21" day={day} locale="en-US" {...handlers} />)
    return handlers
  }

  it('shows the day and meal totals, and every meal', () => {
    renderDay()
    expect(screen.getByText(text.dayTotal).parentElement).toHaveTextContent(
      '300 kcal · 10 g protein · 54 g carbs · 5 g fat',
    )
    const lunch = screen.getByRole('region', { name: text.meals.lunch })
    expect(within(lunch).getByText(text.emptyMeal)).toBeInTheDocument()
    // Nothing logged: 0 g, not "not set".
    expect(lunch).toHaveTextContent('0 kcal · 0 g protein · 0 g carbs · 0 g fat')
    expect(screen.getByRole('button', { name: /Oats/ })).toHaveTextContent('2 servings')
    expect(screen.queryByText(text.missingCarbsOrFat)).not.toBeInTheDocument()
  })

  it('says when some entries have carbs or fat not set, and shows the known part', () => {
    const old = entry({ id: 'e2', name: 'Old toast', carbsG: null, fatG: null })
    const handlers = {
      onAdd: vi.fn(),
      onCopy: vi.fn(),
      onOpenEntry: vi.fn(),
      onSetComplete: vi.fn(),
    }
    render(
      <LogDay
        date="2026-11-21"
        today="2026-11-21"
        day={{
          ...day,
          byMeal: { ...emptyMeals, breakfast: [entry(), old] },
          total: { kcal: 600, proteinG: 20, carbsG: 54, fatG: 5 },
        }}
        locale="en-US"
        {...handlers}
      />,
    )
    expect(screen.getByText(text.dayTotal).parentElement).toHaveTextContent('54 g carbs · 5 g fat')
    expect(screen.getByText(text.missingCarbsOrFat)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Old toast/ })).toHaveTextContent(
      'carbs not set · fat not set',
    )
  })

  it('measures today against the targets, beside the day total, and no other day', () => {
    const handlers = {
      onAdd: vi.fn(),
      onCopy: vi.fn(),
      onOpenEntry: vi.fn(),
      onSetComplete: vi.fn(async () => {}),
    }
    const targets = { kcal: 1900, proteinG: 147.6 }
    const { unmount } = render(
      <LogDay
        date="2026-11-21"
        today="2026-11-21"
        day={day}
        targets={targets}
        locale="en-US"
        {...handlers}
      />,
    )
    expect(screen.getByText(text.dayTotal)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: strings.targets.title })).toHaveTextContent(
      strings.targets.progress('300 kcal', '1,900 kcal'),
    )
    unmount()

    render(
      <LogDay
        date="2026-11-20"
        today="2026-11-21"
        day={day}
        targets={targets}
        locale="en-US"
        {...handlers}
      />,
    )
    expect(screen.queryByRole('region', { name: strings.targets.title })).toBeNull()
  })

  it('adds to, copies into, and opens entries of a meal', async () => {
    const handlers = renderDay()
    await userEvent.click(screen.getByRole('button', { name: text.addTo(text.meals.dinner) }))
    expect(handlers.onAdd).toHaveBeenCalledWith('dinner')

    await userEvent.click(
      screen.getByRole('button', { name: text.copyFromLabel(text.meals.snacks) }),
    )
    expect(handlers.onCopy).toHaveBeenCalledWith('snacks')

    await userEvent.click(screen.getByRole('button', { name: /Oats/ }))
    expect(handlers.onOpenEntry).toHaveBeenCalledWith(entry())
  })

  it('marks the day complete, and reports a failure', async () => {
    const onSetComplete = vi.fn(async () => {
      throw new Error('quota')
    })
    renderDay(onSetComplete)

    await userEvent.click(screen.getByLabelText(text.complete))

    expect(onSetComplete).toHaveBeenCalledWith(true)
    expect(await screen.findByRole('alert')).toHaveTextContent(text.completeFailed)
    expect(screen.getByLabelText(text.complete)).not.toBeChecked()
  })

  it('shows the box checked as soon as it’s tapped', async () => {
    renderDay(vi.fn(() => new Promise<void>(() => {})))

    await userEvent.click(screen.getByLabelText(text.complete))

    expect(screen.getByLabelText(text.complete)).toBeChecked()
  })
})

describe('dayTitle', () => {
  it('names today and yesterday, and spells out other days', () => {
    expect(dayTitle('2026-11-21', '2026-11-21', 'en-US')).toBe(text.today)
    expect(dayTitle('2026-11-20', '2026-11-21', 'en-US')).toBe(text.yesterday)
    expect(dayTitle('2026-11-18', '2026-11-21', 'en-US')).toBe('Wednesday, November 18')
  })
})
