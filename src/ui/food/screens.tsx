import {
  useFood,
  useFoodActions,
  useFoods,
  useRecipe,
  useRecipeActions,
  useRecipes,
} from '@/data/foodHooks'
import type { FoodView } from '@/data/foods'
import { formatAmount, formatKcal, formatProtein } from '@/domain/format'
import { strings } from '@/strings'

import { type FoodRoute, routeHref } from '../routes'
import { ScreenErrorBoundary } from '../ScreenErrorBoundary'
import { CatalogList } from './CatalogList'
import { FoodEditor } from './FoodEditor'
import { RecipeEditor } from './RecipeEditor'

const logHref = routeHref({ tab: 'log', screen: 'log', date: null })
const foodsHref = routeHref({ tab: 'log', screen: 'foods' })
const recipesHref = routeHref({ tab: 'log', screen: 'recipes' })

const Loading = () => <p className="text-muted">{strings.loading}</p>

const NotFound = ({ text, back }: { text: string; back: { href: string; label: string } }) => (
  <div className="flex flex-col items-start gap-3">
    <p>{text}</p>
    <a href={back.href} className="inline-flex min-h-11 items-center text-accent">
      {back.label}
    </a>
  </div>
)

const go = (href: string) => {
  window.location.hash = href
}

const foodDetail = (food: FoodView, locale: string) =>
  strings.foods.detail(
    strings.foods.serving(formatAmount(food.servingSize, locale), food.servingUnit),
    strings.foods.nutrients(formatKcal(food.kcal, locale), formatProtein(food.proteinG, locale)),
  )

const Foods = ({ locale }: { locale: string }) => {
  const foods = useFoods()
  if (!foods) return <Loading />
  return (
    <CatalogList
      title={strings.foods.title}
      back={{ label: strings.foods.back, href: logHref }}
      add={{ label: strings.foods.add, href: routeHref({ tab: 'log', screen: 'food', id: null }) }}
      text={strings.foods}
      items={foods.map((food) => ({
        id: food.id,
        name: food.name,
        archived: food.archived,
        detail: foodDetail(food, locale),
        href: routeHref({ tab: 'log', screen: 'food', id: food.id }),
      }))}
    />
  )
}

const Recipes = ({ locale }: { locale: string }) => {
  const recipes = useRecipes()
  if (!recipes) return <Loading />
  return (
    <CatalogList
      title={strings.recipes.title}
      back={{ label: strings.recipes.back, href: logHref }}
      add={{
        label: strings.recipes.add,
        href: routeHref({ tab: 'log', screen: 'recipe', id: null }),
      }}
      text={strings.recipes}
      items={recipes.map((recipe) => ({
        id: recipe.id,
        name: recipe.name,
        archived: recipe.archived,
        detail: strings.recipes.detail(
          strings.recipes.makes(formatAmount(recipe.servings, locale)),
          strings.recipes.perServing(
            formatKcal(recipe.perServing.kcal, locale),
            formatProtein(recipe.perServing.proteinG, locale),
          ),
        ),
        href: routeHref({ tab: 'log', screen: 'recipe', id: recipe.id }),
      }))}
    />
  )
}

const NewFood = ({ locale }: { locale: string }) => {
  const actions = useFoodActions()
  return (
    <FoodEditor
      food={null}
      locale={locale}
      backHref={foodsHref}
      onSave={async (input) => {
        await actions.create(input)
        go(foodsHref)
        return true
      }}
      onSetArchived={async () => {}}
    />
  )
}

const EditFood = ({ id, locale }: { id: string; locale: string }) => {
  const food = useFood(id)
  const actions = useFoodActions()
  if (food === undefined) return <Loading />
  if (food === null) {
    return (
      <NotFound
        text={strings.foods.editor.notFound}
        back={{ href: foodsHref, label: strings.foods.editor.back }}
      />
    )
  }
  return (
    <FoodEditor
      // Keyed by id only: archiving or a synced change mustn't reset what the user is typing.
      // Saving keeps the form's values, the later edit winning as everywhere in sync.
      key={food.id}
      food={food}
      locale={locale}
      backHref={foodsHref}
      onSave={async (input) => {
        const result = await actions.update(id, input)
        if (result.ok) go(foodsHref)
        return result.ok
      }}
      onSetArchived={(archived) => actions.setArchived(id, archived)}
    />
  )
}

const RecipeForm = ({ id, locale }: { id: string | null; locale: string }) => {
  const foods = useFoods()
  const recipe = useRecipe(id ?? '')
  const actions = useRecipeActions()
  if (!foods || (id !== null && recipe === undefined)) return <Loading />
  if (id !== null && !recipe) {
    return (
      <NotFound
        text={strings.recipes.editor.notFound}
        back={{ href: recipesHref, label: strings.recipes.editor.back }}
      />
    )
  }
  return (
    <RecipeEditor
      key={id ?? 'new'}
      recipe={id === null ? null : (recipe ?? null)}
      foods={foods}
      locale={locale}
      backHref={recipesHref}
      onSave={async (input) => {
        if (id === null) {
          await actions.create(input)
          go(recipesHref)
          return true
        }
        const result = await actions.update(id, input)
        if (result.ok) go(recipesHref)
        return result.ok
      }}
      onSetArchived={async (archived) => {
        if (id !== null) await actions.setArchived(id, archived)
      }}
    />
  )
}

// Loaded on demand from the shell, so these screens stay out of the first-load bundle.
export const FoodScreens = ({ route, locale }: { route: FoodRoute; locale: string }) => {
  const body = (() => {
    switch (route.screen) {
      case 'foods':
        return <Foods locale={locale} />
      case 'recipes':
        return <Recipes locale={locale} />
      case 'food':
        return route.id === null ? (
          <NewFood locale={locale} />
        ) : (
          <EditFood id={route.id} locale={locale} />
        )
      case 'recipe':
        return <RecipeForm id={route.id} locale={locale} />
    }
  })()
  // Keyed by route, so an error on one screen doesn't follow the user to the next.
  return <ScreenErrorBoundary key={routeHref(route)}>{body}</ScreenErrorBoundary>
}
