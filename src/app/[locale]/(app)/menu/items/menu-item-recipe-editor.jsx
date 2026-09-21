'use client'

import { useQuery } from '@tanstack/react-query'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useId, useMemo } from 'react'

import { RequiredMark } from '@/components/ui/required-mark'
import { useGeminiArSuggestion } from '@/hooks/use-gemini-ar-suggestion'
import { useGeminiEnSuggestion } from '@/hooks/use-gemini-en-suggestion'
import { authGet } from '@/lib/api/auth-client'
import { shouldEnableBilingualTranslate } from '@/lib/i18n/use-bilingual-field-origin'
import {
  STOCK_UNITS,
  compatibleUnits,
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
  const locale = useLocale()
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

  const stockQuery = useQuery({
    queryKey: ['stock', 'items', 'active-for-recipe'],
    queryFn: async () => {
      const d = await authGet('/stock/items?active=true')
      return d.items ?? []
    },
  })

  const stockItems = stockQuery.data ?? []
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
              <Loader2
                className="size-4 shrink-0 animate-spin text-hisabi-teal"
                aria-label={tBi('translating')}
              />
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
              <Loader2
                className="size-4 shrink-0 animate-spin text-hisabi-teal"
                aria-label={tBi('translating')}
              />
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
                  className="grid gap-hisabi-sm rounded-lg border border-hisabi-outline-variant/50 p-hisabi-md sm:grid-cols-[1fr_7rem_6rem_auto]"
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
                      {t('fieldRecipeQty')}
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
      </div>
    </div>
  )
}
