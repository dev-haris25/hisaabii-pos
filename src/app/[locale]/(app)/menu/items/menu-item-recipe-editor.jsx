'use client'

import { useQuery } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useId, useMemo } from 'react'

import { HisabiSpinner } from '@/components/hisabi-spinner'
import { RequiredMark } from '@/components/ui/required-mark'
import { useGeminiArSuggestion } from '@/hooks/use-gemini-ar-suggestion'
import { useGeminiEnSuggestion } from '@/hooks/use-gemini-en-suggestion'
import { authGet } from '@/lib/api/auth-client'
import { shouldEnableBilingualTranslate } from '@/lib/i18n/use-bilingual-field-origin'
import {
  STOCK_UNITS,
  canConvertUnits,
  compatibleUnits,
  convertStockQty,
  formatQtyString,
  parseQty,
  stockUnitLabel,
  unitFamily,
} from '@/lib/stock/units'
import { cn } from '@/lib/utils'

const fieldClass =
  'type-body-md text-hisabi-on-surface placeholder:text-hisabi-outline/70 w-full rounded-lg border border-hisabi-outline-variant bg-hisabi-surface px-hisabi-md py-hisabi-sm outline-none transition-shadow focus:border-hisabi-primary focus:ring-2 focus:ring-hisabi-primary/10'

const STEPS_PAIR_KEY = 'recipeSteps'
const STEPS_MAX = 8000

/**
 * @returns {{ clientId: string, stockItemId: string, quantity: string, unit: import('@/lib/stock/units').StockUnit }}
 */
export function emptyRecipeIngredient() {
  return {
    clientId: `ri-${Math.random().toString(36).slice(2, 10)}`,
    stockItemId: '',
    quantity: '',
    unit: /** @type {import('@/lib/stock/units').StockUnit} */ ('g'),
  }
}

/**
 * @param {{
 *   steps: string
 *   setSteps: (v: string) => void
 *   stepsAr: string
 *   setStepsAr: (v: string) => void
 *   stepsBaseline?: string
 *   stepsArBaseline?: string
 *   translateEnabled?: boolean
 *   origin: 'en' | 'ar' | null
 *   reportUserInput: (lang: 'en' | 'ar', pairKey?: string, opts?: { otherFieldEmpty?: boolean }) => unknown
 *   markAutoFilled: (lang: 'en' | 'ar', pairKey?: string, value?: string) => void
 *   consumeAutoFillSkip: (pairKey: string, lang: 'en' | 'ar', trimmed: string) => boolean
 *   ingredients: Array<{
 *     clientId: string
 *     stockItemId: string
 *     quantity: string
 *     unit: import('@/lib/stock/units').StockUnit
 *   }>
 *   setIngredients: (updater: any) => void
 *   fieldErrors: Record<string, string>
 *   clearFieldError: (key: string) => void
 * }} props
 */
export function MenuItemRecipeEditor({
  steps,
  setSteps,
  stepsAr,
  setStepsAr,
  stepsBaseline = '',
  stepsArBaseline = '',
  translateEnabled = true,
  origin,
  reportUserInput,
  markAutoFilled,
  consumeAutoFillSkip,
  ingredients,
  setIngredients,
  fieldErrors,
  clearFieldError,
}) {
  const t = useTranslations('Menu')
  const tBi = useTranslations('BilingualInvoiceCompany')
  const stepsEnId = useId()
  const stepsArId = useId()

  const { loading: loadingStepsAr } = useGeminiArSuggestion(
    steps,
    (ar) => {
      markAutoFilled('ar', STEPS_PAIR_KEY, ar)
      setStepsAr(ar.slice(0, STEPS_MAX))
    },
    {
      enabled:
        translateEnabled &&
        shouldEnableBilingualTranslate(origin, 'en', stepsAr),
      shouldSkip: (trimmed) =>
        consumeAutoFillSkip(STEPS_PAIR_KEY, 'en', trimmed),
      englishBaseline: stepsBaseline,
      debounceMs: 700,
    },
  )
  const { loading: loadingStepsEn } = useGeminiEnSuggestion(
    stepsAr,
    (en) => {
      markAutoFilled('en', STEPS_PAIR_KEY, en)
      setSteps(en.slice(0, STEPS_MAX))
    },
    {
      enabled:
        translateEnabled &&
        shouldEnableBilingualTranslate(origin, 'ar', steps),
      shouldSkip: (trimmed) =>
        consumeAutoFillSkip(STEPS_PAIR_KEY, 'ar', trimmed),
      arabicBaseline: stepsArBaseline,
      debounceMs: 700,
    },
  )

  return (
    <div className="flex flex-col gap-hisabi-md">
      <p className="type-body-sm text-hisabi-on-surface-variant">
        {t('recipeHint')}
      </p>

      <div className="grid grid-cols-1 gap-hisabi-md min-[900px]:grid-cols-2">
        <label className="flex flex-col gap-1" htmlFor={stepsEnId}>
          <span className="type-label-md flex items-center gap-2 text-hisabi-on-surface">
            {t('fieldRecipeStepsEn')}
            {loadingStepsEn ? (
              <HisabiSpinner size="inline" className="text-hisabi-teal" label={tBi('translating')} />
            ) : null}
          </span>
          <textarea
            id={stepsEnId}
            className={cn(fieldClass, 'min-h-28 resize-y')}
            value={steps}
            maxLength={STEPS_MAX}
            dir="ltr"
            placeholder={t('fieldRecipeStepsPlaceholder')}
            onChange={(e) => {
              const next = e.target.value.slice(0, STEPS_MAX)
              reportUserInput('en', STEPS_PAIR_KEY, {
                otherFieldEmpty: !stepsAr.trim(),
              })
              setSteps(next)
            }}
          />
        </label>

        <label className="flex flex-col gap-1" htmlFor={stepsArId}>
          <span className="type-label-md flex items-center gap-2 text-hisabi-on-surface">
            {t('fieldRecipeStepsAr')}
            {loadingStepsAr ? (
              <HisabiSpinner size="inline" className="text-hisabi-teal" label={tBi('translating')} />
            ) : null}
          </span>
          <textarea
            id={stepsArId}
            className={cn(fieldClass, 'min-h-28 resize-y')}
            value={stepsAr}
            maxLength={STEPS_MAX}
            dir="rtl"
            placeholder={t('fieldRecipeStepsArPlaceholder')}
            onChange={(e) => {
              const next = e.target.value.slice(0, STEPS_MAX)
              reportUserInput('ar', STEPS_PAIR_KEY, {
                otherFieldEmpty: !steps.trim(),
              })
              setStepsAr(next)
            }}
          />
        </label>
      </div>

      <div className="flex flex-col gap-hisabi-sm">
        <span className="type-label-md text-hisabi-on-surface">
          {t('fieldRecipeIngredients')}
        </span>
        <RecipeIngredientRows
          ingredients={ingredients}
          setIngredients={setIngredients}
          fieldErrors={fieldErrors}
          clearFieldError={clearFieldError}
        />
      </div>
    </div>
  )
}

/** Active stock items for ingredient pickers (shared query cache). */
function useRecipeStockItems() {
  const locale = useLocale()
  const stockQuery = useQuery({
    queryKey: ['stock', 'items', 'active-for-recipe'],
    queryFn: async () => {
      const d = await authGet('/stock/items?active=true')
      return d.items ?? []
    },
  })

  const stockItems = useMemo(() => stockQuery.data ?? [], [stockQuery.data])
  const stockById = useMemo(() => {
    /** @type {Map<string, any>} */
    const m = new Map()
    for (const s of stockItems) m.set(s.id, s)
    return m
  }, [stockItems])

  function stockLabel(item) {
    if (!item) return ''
    const name =
      locale === 'en' && item.nameEn ? item.nameEn : item.nameAr
    return `${name} (${item.unitLabel || stockUnitLabel(item.unit)})`
  }

  return { stockItems, stockById, stockLabel }
}

/**
 * @typedef {{
 *   clientId: string
 *   stockItemId: string
 *   quantity: string
 *   unit: import('@/lib/stock/units').StockUnit
 * }} IngredientRow
 */

/** Positive quantity typed in a row, else null (empty / invalid / zero). */
function rowQty(row) {
  const raw = String(row?.quantity ?? '').trim()
  if (!/^\d+(\.\d+)?$/.test(raw)) return null
  const n = parseQty(raw)
  return n != null && n > 0 ? n : null
}

/**
 * What one serving uses for an extras row: the default recipe amount of the
 * same stock item (from the current form state) plus the extra, in the stock
 * item's unit. Null while the row is empty or invalid.
 *
 * @param {IngredientRow} extra
 * @param {IngredientRow[]} defaultRows
 * @param {{ unit: import('@/lib/stock/units').StockUnit } | undefined} stock
 */
function extraRowTotal(extra, defaultRows, stock) {
  const extraN = rowQty(extra)
  if (!extra.stockItemId || extraN == null) return null
  const unit = stock?.unit ?? extra.unit
  if (!canConvertUnits(extra.unit, unit)) return null
  const toUnit = (n, from) =>
    parseQty(convertStockQty(formatQtyString(n), from, unit)) ?? 0
  let base = 0
  let inRecipe = false
  for (const row of defaultRows) {
    const n = rowQty(row)
    if (row.stockItemId !== extra.stockItemId || n == null) continue
    if (!canConvertUnits(row.unit, unit)) continue
    base += toUnit(n, row.unit)
    inRecipe = true
  }
  const added = toUnit(extraN, extra.unit)
  return { inRecipe, base, added, total: base + added, unit }
}

/**
 * Editable ingredient rows (stock item, qty per 1 menu item, unit) — used for
 * the default recipe and for variant option / customization extras.
 * Pass `defaultIngredients` for extras rows: the quantity is then labelled as
 * an extra amount and each row shows default + extra = total per serving.
 *
 * @param {{
 *   ingredients: IngredientRow[]
 *   setIngredients: (updater: any) => void
 *   fieldErrors: Record<string, string>
 *   clearFieldError: (key: string) => void
 *   defaultIngredients?: IngredientRow[]
 * }} props
 */
export function RecipeIngredientRows({
  ingredients,
  setIngredients,
  fieldErrors,
  clearFieldError,
  defaultIngredients,
}) {
  const t = useTranslations('Menu')
  const { stockItems, stockById, stockLabel } = useRecipeStockItems()
  const isExtra = Array.isArray(defaultIngredients)

  /** @param {number} n @param {import('@/lib/stock/units').StockUnit} unit */
  function amount(n, unit) {
    return `${formatQtyString(n)} ${stockUnitLabel(unit)}`
  }

  /** @param {string} chunks */
  const qtyTag = (chunks) => <bdi dir="ltr">{chunks}</bdi>

  /** @param {IngredientRow} ing */
  function extraTotalLine(ing) {
    const r = extraRowTotal(ing, defaultIngredients ?? [], stockById.get(ing.stockItemId))
    if (!r) return null
    return (
      <p className="type-body-sm text-hisabi-on-surface-variant sm:col-span-4">
        {r.inRecipe
          ? t.rich('extraTotalWithDefault', {
              base: amount(r.base, r.unit),
              extra: amount(r.added, r.unit),
              total: amount(r.total, r.unit),
              q: qtyTag,
            })
          : t.rich('extraTotalNotInDefault', {
              total: amount(r.total, r.unit),
              q: qtyTag,
            })}
      </p>
    )
  }

  return (
    <>
      {ingredients.length === 0 ? (
        <button
          type="button"
          onClick={() =>
            setIngredients((prev) => [...prev, emptyRecipeIngredient()])
          }
          className="type-label-sm inline-flex cursor-pointer items-center gap-1 self-start font-semibold text-hisabi-secondary hover:underline"
        >
          <Plus className="size-4 shrink-0" aria-hidden />
          {t('addRecipeIngredient')}
        </button>
      ) : (
        <div className="flex flex-col gap-hisabi-md">
          {ingredients.map((ing) => {
            const stock = stockById.get(ing.stockItemId)
            const units = stock
              ? compatibleUnits(stock.unit)
              : STOCK_UNITS.filter((u) => unitFamily(u) !== 'piece').concat([
                  'piece',
                ])
            return (
              <div
                key={ing.clientId}
                className={cn(
                  'grid gap-hisabi-sm rounded-lg border border-hisabi-outline-variant/50 p-hisabi-md',
                  // Extras: longer qty label, so the stock picker gives up width;
                  // fields align at the bottom when that label wraps.
                  isExtra
                    ? 'sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_6rem_auto] sm:items-end'
                    : 'sm:grid-cols-[1fr_7rem_6rem_auto]',
                )}
              >
                <label className="flex flex-col gap-1">
                  <span className="type-body-sm text-hisabi-on-surface-variant">
                    {t('fieldStockItem')}
                    <RequiredMark />
                  </span>
                  <select
                    className={cn(
                      fieldClass,
                      fieldErrors[`ri-${ing.clientId}`] &&
                        'border-hisabi-error',
                    )}
                    value={ing.stockItemId}
                    onChange={(e) => {
                      clearFieldError(`ri-${ing.clientId}`)
                      const nextId = e.target.value
                      const nextStock = stockById.get(nextId)
                      setIngredients((prev) =>
                        prev.map((row) =>
                          row.clientId === ing.clientId
                            ? {
                                ...row,
                                stockItemId: nextId,
                                unit: nextStock
                                  ? nextStock.unit
                                  : row.unit,
                              }
                            : row,
                        ),
                      )
                    }}
                  >
                    <option value="">{t('selectStockItem')}</option>
                    {stockItems.map((s) => (
                      <option key={s.id} value={s.id}>
                        {stockLabel(s)}
                        {s.isBulk ? ` · ${t('stockBulkTag')}` : ''}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="type-body-sm text-hisabi-on-surface-variant">
                    {isExtra ? t('fieldExtraQty') : t('fieldRecipeQty')}
                    <RequiredMark />
                  </span>
                  <input
                    className={cn(
                      fieldClass,
                      fieldErrors[`ri-qty-${ing.clientId}`] &&
                        'border-hisabi-error',
                    )}
                    inputMode="decimal"
                    value={ing.quantity}
                    placeholder={t('fieldRecipeQtyPlaceholder')}
                    onChange={(e) => {
                      clearFieldError(`ri-qty-${ing.clientId}`)
                      setIngredients((prev) =>
                        prev.map((row) =>
                          row.clientId === ing.clientId
                            ? { ...row, quantity: e.target.value }
                            : row,
                        ),
                      )
                    }}
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="type-body-sm text-hisabi-on-surface-variant">
                    {t('fieldRecipeUnit')}
                  </span>
                  <select
                    className={fieldClass}
                    value={ing.unit}
                    onChange={(e) =>
                      setIngredients((prev) =>
                        prev.map((row) =>
                          row.clientId === ing.clientId
                            ? {
                                ...row,
                                unit: /** @type {any} */ (e.target.value),
                              }
                            : row,
                        ),
                      )
                    }
                  >
                    {units.map((u) => (
                      <option key={u} value={u}>
                        {stockUnitLabel(u)}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="flex items-end justify-end pb-1">
                  <button
                    type="button"
                    aria-label={t('removeRecipeIngredient')}
                    className="rounded-md p-2 text-hisabi-on-surface-variant hover:bg-hisabi-surface-container hover:text-hisabi-error"
                    onClick={() =>
                      setIngredients((prev) =>
                        prev.filter((row) => row.clientId !== ing.clientId),
                      )
                    }
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
                {isExtra ? extraTotalLine(ing) : null}
              </div>
            )
          })}

          <button
            type="button"
            onClick={() =>
              setIngredients((prev) => [...prev, emptyRecipeIngredient()])
            }
            className="type-label-sm inline-flex cursor-pointer items-center gap-1 self-start font-semibold text-hisabi-secondary hover:underline"
          >
            <Plus className="size-4 shrink-0" aria-hidden />
            {t('addRecipeIngredient')}
          </button>
        </div>
      )}
    </>
  )
}
