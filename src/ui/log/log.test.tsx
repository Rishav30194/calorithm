import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import type { FoodView, RecipeView } from '@/data/foods'
import type { LoggedEntry, QuickPicks } from '@/data/log'
import type { CatalogState, DayView } from '@/data/logHooks'
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
  catalogId: null,
  barcode: null,
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
}
const picks: QuickPicks = {
  recent: [{ source: { kind: 'food', id: 'f1' }, name: 'Oats', servings: 2, count: 1 }],
  mostUsed: [],
  byMeal: {
    breakfast: [{ source: { kind: 'recipe', id: 'r1' }, name: 'Chili', servings: 1, count: 3 }],
    lunch: [],
    dinner: [],
    snacks: [],
  },
  scores: new Map([
    ['food:f1', 1],
    ['recipe:r1', 0.5],
  ]),
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
  portion: null,
  perServing: { kcal: 150, proteinG: 5, carbsG: 27, fatG: 2.5 },
  ...overrides,
})

const emptyMeals = { breakfast: [], lunch: [], dinner: [], snacks: [] }
const zero = { kcal: 0, proteinG: 0, carbsG: null, fatG: null }

describe('LogPicker', () => {
  const renderPicker = (onPick = vi.fn(async () => true), onClose = vi.fn()) => {
    render(
      <LogPicker
        meal="breakfast"
        picks={picks}
        foods={[oats, butter]}
        recipes={[chili]}
        builtIn={undefined}
        locale="en-US"
        onPickBuiltIn={vi.fn()}
        onSearch={vi.fn()}
        onRetryBuiltIn={vi.fn()}
        onLookup={vi.fn()}
        onLogScanned={vi.fn()}
        onLogNew={vi.fn()}
        onPick={onPick}
        onClose={onClose}
      />,
    )
    return { onPick, onClose }
  }

  // Phase 14: a food measured by weight asks for the amount, starting from the last one.
  it('opens the amount step for a weighed quick pick, with the servings last logged', async () => {
    const { onPick, onClose } = renderPicker()
    const recent = screen.getByRole('heading', { name: text.picker.recent }).closest('section')
    if (!recent) throw new Error('no recent section')

    await userEvent.click(within(recent).getByRole('button', { name: /Oats/ }))
    expect(onPick).not.toHaveBeenCalled()
    const grams = screen.getByLabelText(text.amount.amount('g'))
    expect(grams).toHaveValue('80')

    await userEvent.clear(grams)
    await userEvent.type(grams, '60')
    await userEvent.click(screen.getByRole('button', { name: text.amount.log }))
    expect(onPick).toHaveBeenCalledWith({ kind: 'food', id: 'f1' }, 1.5)
    expect(onClose).toHaveBeenCalled()
  })

  it('logs a count food’s quick pick in one tap, with the servings last logged', async () => {
    const roti: FoodView = { ...oats, id: 'f9', name: 'Roti', servingSize: 1, servingUnit: 'roti' }
    const onPick = vi.fn(async () => true)
    render(
      <LogPicker
        meal="breakfast"
        picks={{
          recent: [{ source: { kind: 'food', id: 'f9' }, name: 'Roti', servings: 2, count: 1 }],
          mostUsed: [],
          byMeal: { breakfast: [], lunch: [], dinner: [], snacks: [] },
          scores: new Map(),
        }}
        foods={[roti]}
        recipes={[]}
        builtIn={undefined}
        locale="en-US"
        onPickBuiltIn={vi.fn()}
        onSearch={vi.fn()}
        onRetryBuiltIn={vi.fn()}
        onLookup={vi.fn()}
        onLogScanned={vi.fn()}
        onLogNew={vi.fn()}
        onPick={onPick}
        onClose={vi.fn()}
      />,
    )
    const recent = screen.getByRole('heading', { name: text.picker.recent }).closest('section')
    if (!recent) throw new Error('no recent section')
    await userEvent.click(within(recent).getByRole('button', { name: /Roti/ }))

    expect(onPick).toHaveBeenCalledWith({ kind: 'food', id: 'f9' }, 2)
    expect(screen.queryByLabelText(/^Amount/)).toBeNull()
  })

  it('logs from the amount step with Enter, and clears its error on Back', async () => {
    const { onPick } = renderPicker(vi.fn(async () => false))
    await userEvent.type(screen.getByLabelText(text.picker.search), 'Oats')
    await userEvent.click(screen.getByRole('button', { name: /Oats/ }))
    expect(screen.getByLabelText(text.amount.amount('g'))).toHaveFocus()

    await userEvent.keyboard('{Enter}')
    expect(onPick).toHaveBeenCalledWith({ kind: 'food', id: 'f1' }, 1)
    expect(await screen.findByRole('alert')).toHaveTextContent(text.picker.failed)

    await userEvent.click(screen.getByRole('button', { name: text.label.back }))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('refuses an amount whose totals are past what an entry holds', async () => {
    const { onPick } = renderPicker()
    await userEvent.type(screen.getByLabelText(text.picker.search), 'Oats')
    await userEvent.click(screen.getByRole('button', { name: /Oats/ }))
    const grams = screen.getByLabelText(text.amount.amount('g'))

    // 40 g is 150 kcal, so 1000 servings (40000 g) is 150000 kcal, past 100000.
    await userEvent.clear(grams)
    await userEvent.type(grams, '40000')
    await userEvent.click(screen.getByRole('button', { name: text.amount.log }))

    expect(onPick).not.toHaveBeenCalled()
    expect(grams).toHaveAccessibleDescription(text.amount.tooLarge)
  })

  it('goes back from the amount step to the list without logging', async () => {
    const { onPick } = renderPicker()
    await userEvent.type(screen.getByLabelText(text.picker.search), 'Oats')
    await userEvent.click(screen.getByRole('button', { name: /Oats/ }))
    await userEvent.click(screen.getByRole('button', { name: text.label.back }))

    expect(screen.getByLabelText(text.picker.search)).toBeInTheDocument()
    expect(onPick).not.toHaveBeenCalled()
  })

  describe('built-in foods (decision 0027)', () => {
    const haldi = {
      id: 'turmeric',
      name: 'Turmeric',
      aliases: ['haldi'],
      category: 'spices',
      servingSize: 1,
      servingUnit: 'tsp (3 g)',
      kcal: 9,
      proteinG: 0.3,
      carbsG: 2,
      fatG: 0.1,
      source: { dataset: 'SR Legacy', fdcId: 172231 },
    }
    const renderWith = (foods: FoodView[], builtIn: CatalogState | undefined) => {
      const handlers = {
        onPickBuiltIn: vi.fn(async () => true),
        onSearch: vi.fn(),
        onRetryBuiltIn: vi.fn(),
      }
      render(
        <LogPicker
          meal="lunch"
          picks={picks}
          foods={foods}
          recipes={[]}
          builtIn={builtIn}
          locale="en-US"
          onPick={vi.fn()}
          onLookup={vi.fn()}
          onLogScanned={vi.fn()}
          onLogNew={vi.fn()}
          onClose={vi.fn()}
          {...handlers}
        />,
      )
      return handlers
    }

    it('asks for the list on the first search, and logs a built-in match in one tap', async () => {
      const { onSearch, onPickBuiltIn } = renderWith([], [haldi])
      await userEvent.type(screen.getByLabelText(text.picker.search), 'haldi')

      expect(onSearch).toHaveBeenCalled()
      const section = screen.getByRole('region', { name: text.picker.builtIn })
      expect(section).toHaveTextContent(text.picker.builtInSource)
      await userEvent.click(within(section).getByRole('button', { name: /Turmeric/ }))
      // A teaspoon is a piece, not a weight, so it logs in one tap.
      expect(onPickBuiltIn).toHaveBeenCalledWith(haldi, 1)
    })

    it('shows your copy instead of the built-in item once you have one', async () => {
      renderWith([{ ...oats, id: 'f9', name: 'Turmeric', catalogId: 'turmeric' }], [haldi])
      await userEvent.type(screen.getByLabelText(text.picker.search), 'turm')

      const section = screen.getByRole('region', { name: text.picker.builtIn })
      expect(within(section).queryAllByRole('button')).toHaveLength(0)
      expect(screen.getAllByRole('button', { name: /Turmeric/ })).toHaveLength(1)
    })

    it('offers a retry when the list fails to load, without saying nothing matches', async () => {
      const { onRetryBuiltIn } = renderWith([], 'failed')
      await userEvent.type(screen.getByLabelText(text.picker.search), 'dahi')

      expect(screen.getByText(text.picker.builtInFailed)).toBeInTheDocument()
      expect(screen.queryByText(text.picker.noMatch)).not.toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: text.picker.builtInRetry }))
      expect(onRetryBuiltIn).toHaveBeenCalled()
    })

    it('lets someone with no foods yet search the built-in list', async () => {
      renderWith([], 'loading')
      expect(screen.getByText(text.picker.empty)).toBeInTheDocument()
      await userEvent.type(screen.getByLabelText(text.picker.search), 'dahi')
      expect(screen.getByText(text.picker.builtInLoading)).toBeInTheDocument()
    })
  })

  // Phase 15.
  it('lists what the meal usually holds above the recent foods', () => {
    renderPicker()
    const usual = screen.getByRole('heading', { name: text.picker.usual.breakfast })
    const section = usual.closest('section')
    if (!section) throw new Error('no usual section')
    expect(within(section).getByRole('button', { name: /Chili/ })).toBeInTheDocument()
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(headings.indexOf(text.picker.usual.breakfast)).toBeLessThan(
      headings.indexOf(text.picker.recent),
    )
  })

  it('groups search results: logged before, then your other foods', async () => {
    renderPicker()
    // Butter is archived, so a second, unlogged food joins the search.
    await userEvent.type(screen.getByLabelText(text.picker.search), 'o')
    const logged = screen
      .getByRole('heading', { name: text.picker.loggedBefore })
      .closest('section')
    if (!logged) throw new Error('no logged-before section')
    expect(within(logged).getByRole('button', { name: /Oats/ })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: text.picker.all })).toBeNull()
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
    await userEvent.click(screen.getByRole('button', { name: text.amount.log }))

    expect(await screen.findByRole('alert')).toHaveTextContent(text.picker.failed)
    expect(onClose).not.toHaveBeenCalled()
  })

  // Phase 9 criterion: frequent matches above rare ones, then by name.
  it('ranks search matches by how much they are used, then by name', async () => {
    const bran: FoodView = { ...oats, id: 'f3', name: 'Oat bran' }
    const cookie: FoodView = { ...oats, id: 'f4', name: 'Oat cookie' }
    render(
      <LogPicker
        meal="lunch"
        picks={{
          ...picks,
          scores: new Map([
            ['food:f1', 1],
            ['food:f3', 4],
          ]),
        }}
        foods={[cookie, oats, bran]}
        recipes={[]}
        builtIn={undefined}
        locale="en-US"
        onPickBuiltIn={vi.fn()}
        onSearch={vi.fn()}
        onRetryBuiltIn={vi.fn()}
        onLookup={vi.fn()}
        onLogScanned={vi.fn()}
        onLogNew={vi.fn()}
        onPick={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    await userEvent.type(screen.getByLabelText(text.picker.search), 'oat')

    // Searching groups them (phase 15): the logged ones by use, then the rest by name.
    const names = (heading: string) => {
      const section = screen.getByRole('heading', { name: heading }).closest('section')
      if (!section) throw new Error(`no ${heading} list`)
      return within(section)
        .getAllByRole('button')
        .map((button) => button.textContent)
    }
    expect(names(text.picker.loggedBefore)).toEqual([
      expect.stringContaining('Oat bran'),
      expect.stringContaining('Oats'),
    ])
    expect(names(text.picker.yours)).toEqual([expect.stringContaining('Oat cookie')])
  })

  it('shows loading, then the empty state when nothing is saved', () => {
    const { rerender } = render(
      <LogPicker
        meal="lunch"
        picks={undefined}
        foods={undefined}
        recipes={undefined}
        builtIn={undefined}
        locale="en-US"
        onPickBuiltIn={vi.fn()}
        onSearch={vi.fn()}
        onRetryBuiltIn={vi.fn()}
        onLookup={vi.fn()}
        onLogScanned={vi.fn()}
        onLogNew={vi.fn()}
        onPick={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText(strings.loading)).toBeInTheDocument()

    rerender(
      <LogPicker
        meal="lunch"
        picks={{
          recent: [],
          mostUsed: [],
          byMeal: { breakfast: [], lunch: [], dinner: [], snacks: [] },
          scores: new Map(),
        }}
        foods={[]}
        recipes={[]}
        builtIn={undefined}
        locale="en-US"
        onPickBuiltIn={vi.fn()}
        onSearch={vi.fn()}
        onRetryBuiltIn={vi.fn()}
        onLookup={vi.fn()}
        onLogScanned={vi.fn()}
        onLogNew={vi.fn()}
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

  // Phase 14: 70 g of a 100 g serving is 0.7 servings.
  it('edits a weighed entry in grams, kept in step with servings, with a preview', async () => {
    const onSave = vi.fn(async () => true)
    const chicken = entry({
      name: 'Chicken breast',
      servings: 1,
      portion: { amount: 100, unit: 'g' },
      perServing: { kcal: 165, proteinG: 31, carbsG: 0, fatG: 3.6 },
    })
    render(
      <EntryDialog
        entry={chicken}
        locale="en-US"
        onSave={onSave}
        onRemove={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    const grams = screen.getByLabelText(text.amount.amount('g'))
    const servings = screen.getByLabelText(text.amount.servings)
    expect(grams).toHaveValue('100')
    expect(servings).toHaveAccessibleDescription(text.amount.perServing('100 g'))

    await userEvent.clear(grams)
    await userEvent.type(grams, '70')
    expect(servings).toHaveValue('0.7')
    expect(screen.getByRole('status')).toHaveTextContent(
      text.amount.preview('116 kcal · 21.7 g protein · 0 g carbs · 2.5 g fat'),
    )

    await userEvent.clear(servings)
    await userEvent.type(servings, '1.5')
    expect(grams).toHaveValue('150')

    // An amount that comes to under 0.01 servings clears Servings rather than leave 1.5.
    await userEvent.clear(grams)
    await userEvent.type(grams, '0.3')
    expect(servings).toHaveValue('')

    await userEvent.clear(grams)
    await userEvent.type(grams, '70')
    await userEvent.click(screen.getByRole('button', { name: text.entry.save }))
    expect(onSave).toHaveBeenCalledWith(0.7)
  })

  // 200 servings of 27 g carbs is 5400 g; 400 is 10800 g, past the 10000 g an entry holds.
  it('refuses servings whose totals are past what an entry holds', async () => {
    const onSave = vi.fn(async () => true)
    render(
      <EntryDialog
        entry={entry()}
        locale="en-US"
        onSave={onSave}
        onRemove={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    const field = screen.getByLabelText(text.entry.servings)

    await userEvent.clear(field)
    await userEvent.type(field, '400')
    await userEvent.click(screen.getByRole('button', { name: text.entry.save }))
    expect(onSave).not.toHaveBeenCalled()
    expect(field).toHaveAccessibleDescription(text.amount.tooLarge)

    await userEvent.clear(field)
    await userEvent.type(field, '200')
    await userEvent.click(screen.getByRole('button', { name: text.entry.save }))
    expect(onSave).toHaveBeenCalledWith(200)
  })

  it('says an entry whose one serving is past the limits can only be removed', async () => {
    const onSave = vi.fn(async () => true)
    const huge = entry({ perServing: { kcal: 150_000, proteinG: 5, carbsG: 27, fatG: 2.5 } })
    render(
      <EntryDialog
        entry={huge}
        locale="en-US"
        onSave={onSave}
        onRemove={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    const field = screen.getByLabelText(text.entry.servings)

    await userEvent.clear(field)
    await userEvent.type(field, '0.5')
    await userEvent.click(screen.getByRole('button', { name: text.entry.save }))

    expect(onSave).not.toHaveBeenCalled()
    expect(field).toHaveAccessibleDescription(text.amount.cannotKeep)
  })

  it('refuses a one-tap recipe whose serving is past what an entry holds', async () => {
    const onPick = vi.fn(async () => true)
    render(
      <LogPicker
        meal="breakfast"
        picks={picks}
        foods={[oats]}
        recipes={[
          { ...chili, perServing: { kcal: 150_000, proteinG: 1, carbsG: null, fatG: null } },
        ]}
        builtIn={undefined}
        locale="en-US"
        onPick={onPick}
        onPickBuiltIn={vi.fn(async () => true)}
        onSearch={vi.fn()}
        onRetryBuiltIn={vi.fn()}
        onLookup={vi.fn()}
        onLogScanned={vi.fn(async () => true)}
        onLogNew={vi.fn(async () => true)}
        onClose={vi.fn()}
      />,
    )
    await userEvent.type(screen.getByLabelText(text.picker.search), 'Chili')
    await userEvent.click(screen.getByRole('button', { name: /Chili/ }))

    expect(onPick).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(text.amount.tooLarge)
  })

  it('offers servings only for an entry without a weight', () => {
    render(
      <EntryDialog
        entry={entry()}
        locale="en-US"
        onSave={vi.fn()}
        onRemove={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.queryByLabelText(/^Amount/)).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent(
      text.amount.preview('300 kcal · 10 g protein · 54 g carbs · 5 g fat'),
    )
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

  it('offers no day before 2000-01-01, which the database doesn’t keep', () => {
    const handlers = {
      onAdd: vi.fn(),
      onCopy: vi.fn(),
      onOpenEntry: vi.fn(),
      onSetComplete: vi.fn(),
    }
    render(<LogDay date="2000-01-01" today="2026-11-21" day={day} locale="en-US" {...handlers} />)
    expect(screen.queryByRole('link', { name: text.previousDay })).toBeNull()
    expect(screen.getByRole('link', { name: text.nextDay })).toBeInTheDocument()
  })

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

  // Phase 19: a floor that trims the higher-calorie days says so where the target shows.
  it('says when the calorie floor trims today’s higher-calorie days', () => {
    render(
      <LogDay
        date="2026-11-21"
        today="2026-11-21"
        day={day}
        targets={{ kcal: 1550, proteinG: 147.6, trimmed: true }}
        locale="en-US"
        onAdd={vi.fn()}
        onCopy={vi.fn()}
        onOpenEntry={vi.fn()}
        onSetComplete={vi.fn(async () => {})}
      />,
    )
    expect(screen.getByRole('region', { name: strings.targets.title })).toHaveTextContent(
      strings.targets.trimmed,
    )
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
