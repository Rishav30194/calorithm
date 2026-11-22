import { type CatalogFood, searchCatalog } from '@/data/catalog/search'
import type { CatalogState } from '@/data/logHooks'
import { formatAmount } from '@/domain/format'
import { strings } from '@/strings'

import { macroText } from '../macros'

type Props = {
  // Undefined until the first search asks for the list.
  state: CatalogState | undefined
  query: string
  // Built-in items already copied into your foods, which show as your own instead.
  copied: ReadonlySet<string>
  locale: string
  // How many of your own foods match, so "no match" shows only when nothing does.
  ownMatches: number
  noMatch: string
  busy: boolean
  onRetry: () => void
  onPick: (item: CatalogFood) => void
}

// Built-in foods matching a search, wherever a food is picked or added (phase 14).
export const BuiltInMatches = ({
  state,
  query,
  copied,
  locale,
  ownMatches,
  noMatch,
  busy,
  onRetry,
  onPick,
}: Props) => {
  const text = strings.log.picker
  if (query.trim() === '') return null
  const matches = Array.isArray(state) ? searchCatalog(state, query, copied) : []
  // Only once the list has loaded: not while loading, nor beside its error.
  if (Array.isArray(state) && matches.length === 0 && ownMatches === 0) {
    return <p className="text-muted">{noMatch}</p>
  }
  return (
    <section aria-label={text.builtIn} className="flex flex-col gap-1">
      {state === 'loading' && <p className="text-muted">{text.builtInLoading}</p>}
      {state === 'failed' && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-muted">{text.builtInFailed}</p>
          <button
            type="button"
            onClick={onRetry}
            className="min-h-11 rounded-lg border border-border px-3 font-medium"
          >
            {text.builtInRetry}
          </button>
        </div>
      )}
      {matches.length > 0 && (
        <>
          <h3 className="text-sm font-semibold text-muted">{text.builtIn}</h3>
          <ul className="flex flex-col divide-y divide-border">
            {matches.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onPick(item)}
                  className="flex min-h-14 w-full flex-col items-start justify-center py-2 text-left disabled:opacity-60"
                >
                  <span className="font-medium">{item.name}</span>
                  <span className="text-sm text-muted">
                    {strings.foods.detail(
                      strings.foods.serving(
                        formatAmount(item.servingSize, locale),
                        item.servingUnit,
                      ),
                      macroText(item, locale),
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">{text.builtInSource}</p>
        </>
      )}
    </section>
  )
}
