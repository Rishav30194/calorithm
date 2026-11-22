import { type FormEvent, useEffect, useRef, useState } from 'react'

import type { BarcodeLookup } from '@/data/barcodeLookup'
import type { CatalogCopy, FoodInput, FoodView } from '@/data/foods'
import { OPEN_FOOD_FACTS_SOURCE, type ProductDraft } from '@/data/openFoodFacts/lookup'
import { formatAmount } from '@/domain/format'
import { strings } from '@/strings'

import { emptyFoodValues, FoodForm } from '../food/FoodForm'
import { editableNumber, type FoodFormValues } from '../food/forms'
import { macroText } from '../macros'
import { OpenFoodFactsCredit } from '../OpenFoodFactsCredit'
import { TextField } from '../TextField'
import { BarcodeCamera, type CameraProblem } from './BarcodeCamera'
import { LabelPanel } from './LabelPanel'

type Props = {
  start: 'scan' | 'enter'
  locale: string
  onLookup: (code: string) => Promise<BarcodeLookup>
  onLogSaved: (foodId: string) => Promise<boolean>
  onLogNew: (input: FoodInput | CatalogCopy) => Promise<boolean>
  onBack: () => void
  // After a food is logged, the picker closes.
  onDone: () => void
}

type FormMessage = 'found' | 'notFound' | 'unreachable'

type Step =
  | { kind: 'scan' }
  | { kind: 'enter'; problem: CameraProblem | null }
  | { kind: 'looking' }
  | { kind: 'saved'; foods: FoodView[] }
  | { kind: 'form'; barcode: string; product: ProductDraft | null; message: FormMessage }
  // Reading the label of a pack Open Food Facts couldn't give, keeping its barcode.
  | { kind: 'label'; barcode: string; message: FormMessage }

const problemText = (problem: CameraProblem): string => {
  const text = strings.log.barcode
  switch (problem) {
    case 'denied':
      return text.denied
    case 'no_camera':
      return text.noCamera
    case 'failed':
      return text.cameraFailed
  }
}

const formValues = (barcode: string, product: ProductDraft | null, locale: string) => {
  const show = (value: number | null) => (value === null ? '' : editableNumber(value, locale))
  return product
    ? {
        name: product.name,
        servingSize: show(product.servingSize),
        servingUnit: product.servingUnit,
        kcal: show(product.kcal),
        proteinG: show(product.proteinG),
        carbsG: show(product.carbsG),
        fatG: show(product.fatG),
        barcode,
      }
    : { ...emptyFoodValues, barcode }
}

// The picker's barcode flow: scan or type a code, then log your saved food, or check the
// food Open Food Facts has, or enter it from the label.
export const BarcodePanel = ({
  start,
  locale,
  onLookup,
  onLogSaved,
  onLogNew,
  onBack,
  onDone,
}: Props) => {
  const text = strings.log.barcode
  const [step, setStep] = useState<Step>(
    start === 'scan' ? { kind: 'scan' } : { kind: 'enter', problem: null },
  )
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string | undefined>(undefined)
  const [failed, setFailed] = useState<'lookup' | 'log' | null>(null)
  const [busy, setBusy] = useState(false)
  // Only the latest lookup counts, and none after the panel closes.
  const latest = useRef(0)
  // What was typed in the form, kept while the label panel replaces it.
  const draft = useRef<FoodFormValues | null>(null)
  useEffect(
    () => () => {
      latest.current += 1
    },
    [],
  )

  const lookUp = async (value: string) => {
    const request = ++latest.current
    draft.current = null
    setFailed(null)
    setStep({ kind: 'looking' })
    const result = await onLookup(value).catch(() => null)
    if (request !== latest.current) return
    if (result === null) {
      setCode(value)
      setFailed('lookup')
      setStep({ kind: 'enter', problem: null })
      return
    }
    switch (result.kind) {
      case 'invalid':
        setCode(value)
        setCodeError(
          result.reason === 'check_digit'
            ? strings.foods.errors.barcodeCheckDigit
            : strings.foods.errors.barcode,
        )
        setStep({ kind: 'enter', problem: null })
        return
      case 'saved':
        setStep({ kind: 'saved', foods: result.foods })
        return
      case 'product':
        setStep({
          kind: 'form',
          barcode: result.barcode,
          product: result.product,
          message: 'found',
        })
        return
      case 'not_found':
        setStep({ kind: 'form', barcode: result.barcode, product: null, message: 'notFound' })
        return
      case 'unreachable':
        setStep({ kind: 'form', barcode: result.barcode, product: null, message: 'unreachable' })
        return
    }
  }

  const submitCode = (event: FormEvent) => {
    event.preventDefault()
    setCodeError(undefined)
    void lookUp(code)
  }

  const logSaved = async (foodId: string) => {
    if (busy) return
    setBusy(true)
    setFailed(null)
    const ok = await onLogSaved(foodId).catch(() => false)
    setBusy(false)
    if (ok) onDone()
    else setFailed('log')
  }

  // The form shows its own error when this returns false.
  const logNew = async (input: FoodInput | CatalogCopy): Promise<boolean> => {
    const ok = await onLogNew(input)
    if (ok) onDone()
    return ok
  }

  const back = () => {
    latest.current += 1
    onBack()
  }

  return (
    <div className="flex flex-col gap-3">
      {step.kind !== 'label' && (
        <button
          type="button"
          onClick={back}
          className="inline-flex min-h-11 items-center self-start text-accent"
        >
          {text.back}
        </button>
      )}
      {failed && (
        <p role="alert" className="text-danger">
          {failed === 'lookup' ? text.lookupFailed : strings.log.picker.failed}
        </p>
      )}
      {step.kind === 'scan' && (
        <BarcodeCamera
          onCode={(scanned) => void lookUp(scanned)}
          onProblem={(problem) => setStep({ kind: 'enter', problem })}
        />
      )}
      {step.kind === 'enter' && (
        <form onSubmit={submitCode} noValidate className="flex flex-col gap-3">
          {step.problem && <p role="alert">{problemText(step.problem)}</p>}
          <TextField
            label={text.code}
            hint={text.codeHint}
            value={code}
            onChange={setCode}
            inputMode="numeric"
            error={codeError}
          />
          <button
            type="submit"
            className="min-h-11 rounded-lg bg-accent px-4 font-semibold text-accent-text"
          >
            {text.lookUp}
          </button>
        </form>
      )}
      {step.kind === 'looking' && (
        <p role="status" className="text-muted">
          {text.lookingUp}
        </p>
      )}
      {step.kind === 'saved' && (
        <section className="flex flex-col">
          <h3 className="text-sm font-semibold text-muted">{text.saved}</h3>
          <ul className="flex flex-col divide-y divide-border">
            {step.foods.map((food) => (
              <li key={food.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void logSaved(food.id)}
                  className="flex min-h-14 w-full flex-col items-start justify-center py-2 text-left"
                >
                  <span className="font-medium">{food.name}</span>
                  <span className="text-sm text-muted">
                    {food.archived
                      ? text.archived
                      : strings.foods.detail(
                          strings.foods.serving(
                            formatAmount(food.servingSize, locale),
                            food.servingUnit,
                          ),
                          macroText(food, locale),
                        )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {step.kind === 'form' && (
        <>
          <p role="status">{text[step.message]}</p>
          {step.product === null && (
            <button
              type="button"
              onClick={() =>
                setStep({ kind: 'label', barcode: step.barcode, message: step.message })
              }
              className="min-h-11 self-start rounded-lg border border-border px-3 font-medium"
            >
              {text.readLabel}
            </button>
          )}
          {step.message === 'unreachable' && (
            <button
              type="button"
              onClick={() => void lookUp(step.barcode)}
              className="min-h-11 self-start rounded-lg border border-border px-3 font-medium"
            >
              {text.tryAgain}
            </button>
          )}
          <FoodForm
            initial={draft.current ?? formValues(step.barcode, step.product, locale)}
            onValuesChange={(values) => {
              draft.current = values
            }}
            savedBarcode={null}
            note={step.product && <OpenFoodFactsCredit />}
            submitLabel={text.saveAndLog}
            onSave={(input) =>
              logNew(step.product ? { ...input, catalogId: OPEN_FOOD_FACTS_SOURCE } : input)
            }
          />
        </>
      )}
      {step.kind === 'label' && (
        <LabelPanel
          barcode={step.barcode}
          {...(draft.current ? { draft: draft.current } : {})}
          locale={locale}
          onLogNew={onLogNew}
          backLabel={text.backToForm}
          onBack={() =>
            setStep({ kind: 'form', barcode: step.barcode, product: null, message: step.message })
          }
          onDone={onDone}
        />
      )}
    </div>
  )
}
