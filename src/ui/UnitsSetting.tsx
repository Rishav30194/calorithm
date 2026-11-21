import { useEffect, useState } from 'react'

import type { SetUnitsResult, Units } from '@/data/profile'
import { strings } from '@/strings'

type Props = { units: Units; onChange: (units: Units) => Promise<SetUnitsResult> }

const options: { value: Units; label: string }[] = [
  { value: 'metric', label: strings.units.metric },
  { value: 'imperial', label: strings.units.imperial },
]

export const UnitsSetting = ({ units, onChange }: Props) => {
  // Shows the choice at once; the stored value catches up after the local write, and any
  // later change, such as one synced from another device, replaces it.
  const [selected, setSelected] = useState(units)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => setSelected(units), [units])

  const choose = async (value: Units) => {
    setSelected(value)
    setError(null)
    try {
      const result = await onChange(value)
      if (result.ok) return
      setSelected(units)
      setError(result.reason === 'offline' ? strings.units.offline : strings.sync.signedOut)
    } catch {
      setSelected(units)
      setError(strings.units.failed)
    }
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-lg font-semibold">{strings.units.legend}</legend>
      {options.map(({ value, label }) => (
        <label key={value} className="flex min-h-11 items-center gap-3">
          <input
            type="radio"
            name="units"
            value={value}
            checked={selected === value}
            onChange={() => void choose(value)}
            className="size-5 accent-accent"
          />
          {label}
        </label>
      ))}
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
    </fieldset>
  )
}
