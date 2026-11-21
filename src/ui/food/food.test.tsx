import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import type { FoodView, RecipeDetail } from '@/data/foods'
import { strings } from '@/strings'

import { ScreenErrorBoundary } from '../ScreenErrorBoundary'
import { CatalogList } from './CatalogList'
import { FoodEditor } from './FoodEditor'
import { RecipeEditor } from './RecipeEditor'

// jsdom has no modal dialogs; the browser tests cover the real focus handling.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false
  }
})

const oats: FoodView = {
  id: 'f1',
  name: 'Oats',
  servingSize: 40,
  servingUnit: 'g',
  kcal: 150,
  proteinG: 5,
  archived: false,
}
const milk: FoodView = { ...oats, id: 'f2', name: 'Milk', kcal: 65, proteinG: 3.4 }
const butter: FoodView = { ...oats, id: 'f3', name: 'Butter', archived: true }

const text = strings.foods.editor

describe('FoodEditor', () => {
  it('saves the parsed food', async () => {
    const onSave = vi.fn(async () => true)
    render(
      <FoodEditor
        food={null}
        locale="en-US"
        backHref="#/log/foods"
        onSave={onSave}
        onSetArchived={vi.fn()}
      />,
    )
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(text.name), 'Greek yogurt')
    await user.type(screen.getByLabelText(text.servingSize), '170')
    await user.type(screen.getByLabelText(text.servingUnit), 'g')
    await user.type(screen.getByLabelText(text.kcal), '100')
    await user.type(screen.getByLabelText(text.proteinG), '17')
    await user.click(screen.getByRole('button', { name: text.save }))

    expect(onSave).toHaveBeenCalledWith({
      name: 'Greek yogurt',
      servingSize: 170,
      servingUnit: 'g',
      kcal: 100,
      proteinG: 17,
    })
  })

  it('shows each field’s error and focuses the first bad field', async () => {
    const onSave = vi.fn(async () => true)
    render(
      <FoodEditor
        food={null}
        locale="en-US"
        backHref="#/log/foods"
        onSave={onSave}
        onSetArchived={vi.fn()}
      />,
    )
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(text.name), 'Oats')
    await user.click(screen.getByRole('button', { name: text.save }))

    expect(onSave).not.toHaveBeenCalled()
    const size = screen.getByLabelText(text.servingSize)
    expect(size).toHaveFocus()
    expect(size).toHaveAccessibleDescription(strings.foods.errors.servingSize)
    expect(screen.getByLabelText(text.name)).not.toHaveAttribute('aria-invalid')
  })

  it('shows a failed save', async () => {
    render(
      <FoodEditor
        food={oats}
        locale="en-US"
        backHref="#/log/foods"
        onSave={async () => false}
        onSetArchived={vi.fn()}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: text.save }))

    expect(await screen.findByRole('alert')).toHaveTextContent(text.saveFailed)
  })

  it('prefills an existing food and archives or restores it', async () => {
    const onSetArchived = vi.fn(async () => {})
    const { rerender } = render(
      <FoodEditor
        food={oats}
        locale="de-DE"
        backHref="#/log/foods"
        onSave={vi.fn()}
        onSetArchived={onSetArchived}
      />,
    )
    expect(screen.getByLabelText(text.name)).toHaveValue('Oats')

    await userEvent.click(screen.getByRole('button', { name: text.archive }))
    expect(onSetArchived).toHaveBeenCalledWith(true)

    rerender(
      <FoodEditor
        food={{ ...oats, archived: true, proteinG: 5.5 }}
        locale="de-DE"
        backHref="#/log/foods"
        onSave={vi.fn()}
        onSetArchived={onSetArchived}
      />,
    )
    expect(screen.getByText(text.archivedNote)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: text.restore }))
    expect(onSetArchived).toHaveBeenLastCalledWith(false)
  })
})

describe('RecipeEditor', () => {
  const recipeText = strings.recipes.editor

  const renderNew = (onSave = vi.fn(async () => true)) => {
    render(
      <RecipeEditor
        recipe={null}
        foods={[oats, milk, butter]}
        locale="en-US"
        backHref="#/log/recipes"
        onSave={onSave}
        onSetArchived={vi.fn()}
      />,
    )
    return onSave
  }

  const addIngredient = async (name: string) => {
    await userEvent.click(screen.getByRole('button', { name: recipeText.addIngredient }))
    const picker = screen.getByRole('dialog', { name: strings.recipes.picker.title })
    await userEvent.click(within(picker).getByRole('button', { name: new RegExp(`^${name}`) }))
  }

  it('builds a recipe from picked foods and shows live totals', async () => {
    const onSave = renderNew()
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(recipeText.name), 'Porridge')
    await user.type(screen.getByLabelText(recipeText.servings), '4')
    await addIngredient('Oats')
    await addIngredient('Milk')
    const oatsServings = screen.getByLabelText(recipeText.ingredientServings('Oats'))
    await user.clear(oatsServings)
    await user.type(oatsServings, '2')

    // 150 × 2 + 65 = 365 kcal; 5 × 2 + 3.4 = 13.4 g.
    expect(screen.getByText(recipeText.totals).nextElementSibling).toHaveTextContent(
      strings.foods.nutrients('365 kcal', '13.4 g'),
    )
    expect(screen.getByText(recipeText.perServing).nextElementSibling).toHaveTextContent(
      strings.foods.nutrients('91 kcal', '3.4 g'),
    )

    await user.click(screen.getByRole('button', { name: recipeText.save }))
    expect(onSave).toHaveBeenCalledWith({
      name: 'Porridge',
      servings: 4,
      items: [
        { foodId: 'f1', servings: 2 },
        { foodId: 'f2', servings: 1 },
      ],
    })
  })

  it('offers only foods not archived and not already in the recipe', async () => {
    renderNew()
    await addIngredient('Oats')

    await userEvent.click(screen.getByRole('button', { name: recipeText.addIngredient }))
    const picker = screen.getByRole('dialog', { name: strings.recipes.picker.title })
    const names = within(picker)
      .getAllByRole('button')
      .map((button) => button.textContent)
    expect(names.some((name) => name?.startsWith('Milk'))).toBe(true)
    expect(names.some((name) => name?.startsWith('Oats'))).toBe(false)
    expect(names.some((name) => name?.startsWith('Butter'))).toBe(false)
  })

  it('removes an ingredient and asks for at least one', async () => {
    const onSave = renderNew()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText(recipeText.name), 'Nothing')
    await user.type(screen.getByLabelText(recipeText.servings), '1')
    await addIngredient('Oats')

    await user.click(screen.getByRole('button', { name: recipeText.remove('Oats') }))
    await user.click(screen.getByRole('button', { name: recipeText.save }))

    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(strings.recipes.errors.items)
    expect(screen.getByRole('button', { name: recipeText.addIngredient })).toHaveFocus()
  })

  it('lists an existing recipe’s ingredients by name', () => {
    const recipe: RecipeDetail = {
      id: 'r1',
      name: 'Mix',
      servings: 1,
      archived: false,
      totals: { kcal: 0, proteinG: 0 },
      perServing: { kcal: 0, proteinG: 0 },
      items: [
        {
          foodId: 'f1',
          name: 'Oats',
          servingSize: 40,
          servingUnit: 'g',
          servings: 1,
          perServing: { kcal: 150, proteinG: 5 },
        },
        {
          foodId: 'f2',
          name: 'Milk',
          servingSize: 40,
          servingUnit: 'g',
          servings: 1,
          perServing: { kcal: 65, proteinG: 3.4 },
        },
      ],
    }
    render(
      <RecipeEditor
        recipe={recipe}
        foods={[oats, milk]}
        locale="en-US"
        backHref="#/log/recipes"
        onSave={vi.fn()}
        onSetArchived={vi.fn()}
      />,
    )

    const order = screen
      .getAllByLabelText(/^Servings of /)
      .map((field) => (field instanceof HTMLInputElement ? field.labels?.[0]?.textContent : null))
    expect(order).toEqual([
      recipeText.ingredientServings('Milk'),
      recipeText.ingredientServings('Oats'),
    ])
  })
})

describe('CatalogList', () => {
  const items = [
    { id: 'a', name: 'Oats', archived: false, detail: '40 g', href: '#/log/foods/a' },
    { id: 'b', name: 'Butter', archived: true, detail: '10 g', href: '#/log/foods/b' },
  ]
  const props = {
    title: 'Foods',
    back: { label: 'Back', href: '#/log' },
    add: { label: 'Add food', href: '#/log/foods/new' },
    text: strings.foods,
  }

  it('hides archived rows until asked, and filters by search', async () => {
    render(<CatalogList {...props} items={items} />)
    expect(screen.queryByRole('link', { name: /Butter/ })).not.toBeInTheDocument()

    await userEvent.click(screen.getByLabelText(strings.foods.showArchived))
    expect(screen.getByRole('link', { name: /Butter/ })).toHaveTextContent(strings.foods.archived)

    await userEvent.type(screen.getByLabelText(strings.foods.search), 'zz')
    expect(screen.getByText(strings.foods.noMatch)).toBeInTheDocument()
  })

  it('shows the empty state', () => {
    render(<CatalogList {...props} items={[]} />)
    expect(screen.getByText(strings.foods.empty)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add food' })).toBeInTheDocument()
  })
})

// A screen whose query fails until the test says otherwise.
const flaky = { fail: true }
const Flaky = () => {
  if (flaky.fail) throw new Error('query failed')
  return <p>loaded</p>
}

describe('ScreenErrorBoundary', () => {
  it('shows an error with a retry that renders the screen again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    flaky.fail = true
    render(
      <ScreenErrorBoundary>
        <Flaky />
      </ScreenErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(strings.screenError.title)

    flaky.fail = false
    await userEvent.click(screen.getByRole('button', { name: strings.screenError.retry }))

    expect(screen.getByText('loaded')).toBeInTheDocument()
    vi.restoreAllMocks()
  })
})
