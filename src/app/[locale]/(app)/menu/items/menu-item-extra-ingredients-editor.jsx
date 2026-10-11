'use client'

import { useLocale, useTranslations } from 'next-intl'

import { RecipeIngredientRows } from './menu-item-recipe-editor'

/**
 * @typedef {{
 *   clientId: string
 *   stockItemId: string
 *   quantity: string
 *   unit: import('@/lib/stock/units').StockUnit
 * }} IngredientRow
 */

/**
 * Optional extra ingredients per variant option and per customization. They
 * are added on top of the default recipe when that option / customization is
 * chosen; the lists live on the option / customization rows of the form.
 *
 * @param {{
 *   variantGroups: Array<{
 *     clientId: string
 *     nameAr: string
 *     nameEn: string
 *     options: Array<{ clientId: string, nameAr: string, nameEn: string, ingredients?: IngredientRow[] }>
 *   }>
 *   setVariantGroups: (updater: any) => void
 *   customizations: Array<{ clientId: string, nameAr: string, nameEn: string, ingredients?: IngredientRow[] }>
 *   setCustomizations: (updater: any) => void
 *   fieldErrors: Record<string, string>
 *   clearFieldError: (key: string) => void
 *   defaultIngredients: IngredientRow[]
 * }} props
 */
export function MenuItemExtraIngredientsEditor({
  variantGroups,
  setVariantGroups,
  customizations,
  setCustomizations,
  fieldErrors,
  clearFieldError,
  defaultIngredients,
}) {
  const t = useTranslations('Menu')
  const locale = useLocale()

  /** @param {{ nameAr: string, nameEn: string }} row */
  function displayName(row) {
    const ar = row.nameAr.trim()
    const en = row.nameEn.trim()
    const name = locale === 'en' ? en || ar : ar || en
    return name || t('extrasUnnamed')
  }

  /** @param {IngredientRow[]} prev @param {any} updater */
  function nextRows(prev, updater) {
    return typeof updater === 'function' ? updater(prev) : updater
  }

  /** @param {string} groupId @param {string} optionId */
  function setOptionIngredients(groupId, optionId) {
    return (updater) =>
      setVariantGroups((groups) =>
        groups.map((g) =>
          g.clientId !== groupId
            ? g
            : {
                ...g,
                options: g.options.map((o) =>
                  o.clientId !== optionId
                    ? o
                    : { ...o, ingredients: nextRows(o.ingredients ?? [], updater) },
                ),
              },
        ),
      )
  }

  /** @param {string} customizationId */
  function setCustomizationIngredients(customizationId) {
    return (updater) =>
      setCustomizations((rows) =>
        rows.map((c) =>
          c.clientId !== customizationId
            ? c
            : { ...c, ingredients: nextRows(c.ingredients ?? [], updater) },
        ),
      )
  }

  const hasOptions = variantGroups.some((g) => g.options.length > 0)

  return (
    <div className="flex flex-col gap-hisabi-lg border-t border-hisabi-outline-variant/30 pt-hisabi-lg">
      <section className="flex flex-col gap-hisabi-sm">
        <h3 className="type-label-md text-hisabi-on-surface">
          {t('extrasVariantTitle')}
        </h3>
        <p className="type-body-sm text-hisabi-on-surface-variant">
          {t('extrasVariantHint')}
        </p>
        {!hasOptions ? (
          <p className="type-body-sm text-hisabi-on-surface-variant">
            {t('extrasNoVariants')}
          </p>
        ) : (
          variantGroups.flatMap((group) =>
            group.options.map((option) => (
              <div
                key={option.clientId}
                className="flex flex-col gap-hisabi-sm rounded-lg border border-hisabi-outline-variant/50 bg-hisabi-surface-container-lowest p-hisabi-md"
              >
                <p className="type-label-sm text-hisabi-on-surface">
                  {displayName(group)} · {displayName(option)}
                </p>
                <RecipeIngredientRows
                  ingredients={option.ingredients ?? []}
                  setIngredients={setOptionIngredients(
                    group.clientId,
                    option.clientId,
                  )}
                  fieldErrors={fieldErrors}
                  clearFieldError={clearFieldError}
                  defaultIngredients={defaultIngredients}
                />
              </div>
            )),
          )
        )}
      </section>

      <section className="flex flex-col gap-hisabi-sm">
        <h3 className="type-label-md text-hisabi-on-surface">
          {t('extrasCustomizationTitle')}
        </h3>
        <p className="type-body-sm text-hisabi-on-surface-variant">
          {t('extrasCustomizationHint')}
        </p>
        {customizations.length === 0 ? (
          <p className="type-body-sm text-hisabi-on-surface-variant">
            {t('extrasNoCustomizations')}
          </p>
        ) : (
          customizations.map((row) => (
            <div
              key={row.clientId}
              className="flex flex-col gap-hisabi-sm rounded-lg border border-hisabi-outline-variant/50 bg-hisabi-surface-container-lowest p-hisabi-md"
            >
              <p className="type-label-sm text-hisabi-on-surface">
                {displayName(row)}
              </p>
              <RecipeIngredientRows
                ingredients={row.ingredients ?? []}
                setIngredients={setCustomizationIngredients(row.clientId)}
                fieldErrors={fieldErrors}
                clearFieldError={clearFieldError}
                defaultIngredients={defaultIngredients}
              />
            </div>
          ))
        )}
      </section>
    </div>
  )
}
