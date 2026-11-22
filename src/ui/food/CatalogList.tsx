import { type ReactNode, useId, useState } from 'react'

import { TextField } from '../TextField'

export type CatalogItem = {
  id: string
  name: string
  archived: boolean
  detail: string
  href: string
}

type Props = {
  title: string
  back: { label: string; href: string }
  add: { label: string; href: string }
  text: {
    search: string
    showArchived: string
    archived: string
    empty: string
    noMatch: string
  }
  items: CatalogItem[]
  // More matches for the search, below the list, such as the built-in foods. With them the
  // search shows even when the list is empty.
  extra?: (query: string, shown: number) => ReactNode
  // Told of each search, so the extra matches can load on the first one.
  onSearch?: (query: string) => void
}

const matches = (name: string, query: string) =>
  name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())

// The food and recipe lists: search, an archived switch, and one link per row.
export const CatalogList = ({ title, back, add, text, items, extra, onSearch }: Props) => {
  const [query, setQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const switchId = useId()
  const shown = items.filter(
    (item) => (showArchived || !item.archived) && matches(item.name, query),
  )

  return (
    <div className="flex flex-col gap-4">
      <a href={back.href} className="inline-flex min-h-11 items-center self-start text-accent">
        {back.label}
      </a>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">{title}</h2>
        <a
          href={add.href}
          className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 font-semibold text-accent-text"
        >
          {add.label}
        </a>
      </div>
      {items.length === 0 && <p className="text-muted">{text.empty}</p>}
      {(items.length > 0 || extra) && (
        <>
          <TextField
            label={text.search}
            value={query}
            onChange={(value) => {
              setQuery(value)
              onSearch?.(value)
            }}
            type="search"
          />
          <label htmlFor={switchId} className="flex min-h-11 items-center gap-3">
            <input
              id={switchId}
              type="checkbox"
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
              className="size-5 accent-accent"
            />
            {text.showArchived}
          </label>
          {shown.length === 0 ? (
            items.length > 0 && !extra && <p className="text-muted">{text.noMatch}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border border-y border-border">
              {shown.map((item) => (
                <li key={item.id}>
                  <a href={item.href} className="flex min-h-14 flex-col justify-center py-2">
                    <span className="font-medium">
                      {item.name}
                      {item.archived && (
                        <span className="ml-2 text-sm font-normal text-muted">{text.archived}</span>
                      )}
                    </span>
                    <span className="text-sm text-muted">{item.detail}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
          {extra?.(query, shown.length)}
        </>
      )}
    </div>
  )
}
