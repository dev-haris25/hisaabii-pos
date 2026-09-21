'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  History,
  Package,
  PackagePlus,
  Pencil,
  UtensilsCrossed,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useMemo, useState } from 'react'

import { AppLoader } from '@/components/app-loader'
import { useAppAbility } from '@/components/rbac/ability-provider'
import { SettingsSection } from '@/components/settings/settings-page-shell'
import { PageBackButton } from '@/components/shared/page-back-button'
import { StockAdjustSheet } from './stock-adjust-sheet'
import { Link, useRouter } from '@/i18n/navigation'
import { authGet } from '@/lib/api/auth-client'
import { buildPaginationItems } from '@/lib/list-views/build-pagination-items'
import {
  LIST_TABLE_BASE,
  LIST_TABLE_BODY,
  LIST_TABLE_HEAD_ROW,
  LIST_TABLE_ROW,
  LIST_TABLE_SCROLL_WRAP,
  listTableTdClass,
  listTableThClass,
} from '@/lib/list-views/list-table-styles'
import { stockUnitLabel } from '@/lib/stock/units'
import { cn } from '@/lib/utils'

const MOVEMENTS_PAGE_SIZE_OPTIONS = [10, 25, 50]

function formatWhen(iso, locale) {
  try {
    return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA' : 'en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

/**
 * @param {{ label: string, children: import('react').ReactNode, className?: string }} props
 */
function DetailField({ label, children, className }) {
  return (
    <div className={cn('min-w-0 space-y-hisabi-xs', className)}>
      <p className="type-label-md text-hisabi-on-surface-variant">{label}</p>
      <div className="type-body-md text-hisabi-on-surface">{children}</div>
    </div>
  )
}

/** @param {{ itemId: string }} props */
export function StockItemDetailView({ itemId }) {
  const t = useTranslations('Stock')
  const locale = useLocale()
  const router = useRouter()
  const queryClient = useQueryClient()
  const ability = useAppAbility()
  const canUpdate = ability.can('update', 'StockItem')
  const canReadMenu = ability.can('read', 'MenuItem')
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [movementsPage, setMovementsPage] = useState(1)
  const [movementsLimit, setMovementsLimit] = useState(10)

  const itemQuery = useQuery({
    queryKey: ['stock', 'item', itemId],
    queryFn: async () => {
      const d = await authGet(`/stock/items/${itemId}`)
      return {
        item: d.item,
        recipesUsed: d.recipesUsed ?? [],
      }
    },
  })

  const movementsQuery = useQuery({
    queryKey: ['stock', 'item', itemId, 'movements', movementsPage, movementsLimit],
    queryFn: async () => {
      const d = await authGet(
        `/stock/items/${itemId}/movements?page=${movementsPage}&limit=${movementsLimit}`,
      )
      return {
        movements: d.movements ?? [],
        pagination: d.pagination ?? {
          page: movementsPage,
          limit: movementsLimit,
          total: 0,
          totalPages: 1,
        },
      }
    },
  })

  const movements = movementsQuery.data?.movements ?? []
  const pagination = movementsQuery.data?.pagination
  const safePage = Math.max(1, pagination?.page || movementsPage)
  const totalPages = Math.max(1, pagination?.totalPages || 1)
  const total = pagination?.total || 0
  const pageSize = pagination?.limit || movementsLimit
  const start = total === 0 ? 0 : (safePage - 1) * pageSize
  const listBusy = movementsQuery.isFetching
  const paginationItems = useMemo(
    () => buildPaginationItems(safePage, totalPages),
    [safePage, totalPages],
  )

  useEffect(() => {
    if (!pagination) return
    if (pagination.totalPages > 0 && movementsPage > pagination.totalPages) {
      setMovementsPage(pagination.totalPages)
    }
  }, [pagination, movementsPage])

  if (itemQuery.isPending) {
    return (
      <div className="flex justify-center py-hisabi-xxl">
        <AppLoader />
      </div>
    )
  }

  if (itemQuery.isError || !itemQuery.data?.item) {
    return (
      <div className="mx-auto max-w-hisabi-container">
        <PageBackButton href="/stock" label={t('backToList')} />
        <p className="type-body-md text-hisabi-error" role="alert">
          {t('itemNotFound')}
        </p>
      </div>
    )
  }

  const item = itemQuery.data.item
  const recipesUsed = itemQuery.data.recipesUsed ?? []
  const isDeleted = item.active === false
  const displayName =
    locale === 'en' && item.nameEn ? item.nameEn : item.nameAr
  const unitLabel = item.unitLabel || stockUnitLabel(item.unit)

  function recipeMenuName(row) {
    if (locale === 'en' && row.nameEn) return row.nameEn
    return row.nameAr
  }

  return (
    <div className="mx-auto max-w-hisabi-container pb-hisabi-xxl">
      <PageBackButton href="/stock" label={t('backToList')} />

      <div className="mb-hisabi-xl flex flex-col gap-hisabi-md sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <h1 className="type-headline-xl text-hisabi-on-surface tracking-tight">
            {displayName}
          </h1>
          <p className="type-body-md text-hisabi-on-surface-variant">
            {t('onHandNow', { qty: item.quantityOnHand, unit: unitLabel })}
          </p>
          <div className="flex flex-wrap gap-hisabi-sm">
            {item.isLowStock ? (
              <span className="type-label-sm rounded-md bg-hisabi-error/10 px-2 py-0.5 font-semibold text-hisabi-error">
                {t('lowStockBadge')}
              </span>
            ) : null}
            {item.isBulk ? (
              <span className="type-label-sm rounded-md bg-hisabi-surface-container px-2 py-0.5 text-hisabi-on-surface-variant">
                {t('bulkBadge')}
              </span>
            ) : null}
            <span
              className={cn(
                'type-label-sm rounded-md px-2 py-0.5 font-semibold',
                isDeleted
                  ? 'bg-slate-100 text-slate-600'
                  : 'bg-green-100 text-green-700',
              )}
            >
              {isDeleted ? t('statusDeleted') : t('statusActive')}
            </span>
          </div>
          {isDeleted ? (
            <p className="type-body-sm text-hisabi-on-surface-variant">
              {t('deletedItemHint')}
            </p>
          ) : null}
        </div>

        {!isDeleted && canUpdate ? (
          <div className="flex w-full flex-col gap-hisabi-sm sm:w-auto sm:min-w-[12rem]">
            <button
              type="button"
              className="type-label-md inline-flex min-h-hisabi-btn w-full cursor-pointer items-center justify-center gap-hisabi-sm rounded-xl border-none bg-hisabi-gold-muted px-hisabi-lg py-hisabi-btn font-bold text-hisabi-on-secondary-container shadow-sm transition-all hover:bg-hisabi-gold-muted-hover active:scale-[0.98]"
              onClick={() => setAdjustOpen(true)}
            >
              <PackagePlus className="size-5 shrink-0" aria-hidden />
              {t('adjustStock')}
            </button>
            <Link
              href={`/stock/items/${itemId}/edit`}
              className="type-label-md flex min-h-hisabi-btn w-full cursor-pointer items-center justify-center gap-hisabi-sm rounded-xl border border-hisabi-outline-variant/60 bg-white px-hisabi-lg py-hisabi-btn font-bold text-hisabi-on-surface transition-colors hover:bg-hisabi-surface-container"
            >
              <Pencil className="size-4 shrink-0" aria-hidden />
              {t('edit')}
            </Link>
          </div>
        ) : null}
      </div>

      <div className="space-y-hisabi-xl">
        <SettingsSection title={t('sectionBasics')} icon={Package}>
          <div className="grid grid-cols-1 gap-hisabi-lg min-[480px]:grid-cols-2">
            <DetailField label={t('fieldNameAr')}>{item.nameAr}</DetailField>
            <DetailField label={t('fieldNameEn')}>
              {item.nameEn?.trim() || '—'}
            </DetailField>
            <DetailField label={t('fieldUnit')}>{unitLabel}</DetailField>
            <DetailField label={t('fieldQty')}>
              <span
                className={cn(
                  'tabular-nums font-semibold',
                  item.isLowStock && 'text-hisabi-error',
                )}
              >
                {item.quantityOnHand} {unitLabel}
              </span>
            </DetailField>
            <DetailField label={t('fieldThreshold')}>
              {item.lowStockThreshold ?? '—'}
            </DetailField>
            <DetailField label={t('fieldUnitCost')}>
              {item.unitCost ? (
                <span dir="ltr" className="inline-block tabular-nums">
                  {item.unitCost} SAR
                </span>
              ) : (
                '—'
              )}
            </DetailField>
            <DetailField label={t('fieldIsBulk')}>
              {item.isBulk ? t('bulkYes') : t('bulkNo')}
            </DetailField>
            <DetailField label={t('fieldActive')}>
              {isDeleted ? t('statusDeleted') : t('statusActive')}
            </DetailField>
            {item.notes ? (
              <DetailField label={t('fieldNotes')} className="min-[480px]:col-span-2">
                {item.notes}
              </DetailField>
            ) : null}
          </div>
        </SettingsSection>

        <SettingsSection title={t('recipesUsedTitle')} icon={UtensilsCrossed}>
          {recipesUsed.length === 0 ? (
            <p className="type-body-md text-hisabi-on-surface-variant">
              {t('recipesUsedEmpty')}
            </p>
          ) : (
            <div className={LIST_TABLE_SCROLL_WRAP}>
              <table className={cn(LIST_TABLE_BASE, 'min-w-[480px]')}>
                <thead>
                  <tr className={LIST_TABLE_HEAD_ROW}>
                    <th className={listTableThClass(undefined, true)}>
                      {t('colRecipeMenuItem')}
                    </th>
                    <th className={listTableThClass()}>
                      {t('colRecipeQtyPerServing')}
                    </th>
                    <th className={listTableThClass()}>{t('colUnit')}</th>
                  </tr>
                </thead>
                <tbody className={LIST_TABLE_BODY}>
                  {recipesUsed.map((row) => {
                    const name = recipeMenuName(row)
                    return (
                      <tr key={row.ingredientId} className={LIST_TABLE_ROW}>
                        <td className={listTableTdClass(undefined, true)}>
                          <div className="flex flex-wrap items-center gap-hisabi-sm">
                            {canReadMenu ? (
                              <Link
                                href={`/menu/items/${row.menuItemId}`}
                                className="type-label-lg text-hisabi-primary hover:underline"
                              >
                                {name}
                              </Link>
                            ) : (
                              <span className="type-label-lg text-hisabi-on-surface">
                                {name}
                              </span>
                            )}
                            {!row.menuItemActive ? (
                              <span className="type-label-sm rounded-md bg-slate-100 px-2 py-0.5 text-slate-600">
                                {t('statusInactive')}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className={cn(listTableTdClass(), 'tabular-nums')}>
                          {row.quantity}
                        </td>
                        <td className={listTableTdClass()}>
                          {row.unitLabel || stockUnitLabel(row.unit)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SettingsSection>

        <SettingsSection title={t('historyTitle')} icon={History}>
          {movementsQuery.isPending && !movementsQuery.data ? (
            <div className="flex justify-center py-hisabi-xl">
              <AppLoader />
            </div>
          ) : total === 0 && !listBusy ? (
            <p className="type-body-md text-hisabi-on-surface-variant">
              {t('movementsEmpty')}
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-hisabi-outline-variant/20">
              <div
                className={cn(
                  LIST_TABLE_SCROLL_WRAP,
                  'rounded-none border-0',
                  listBusy && 'opacity-60',
                )}
              >
                <table className={cn(LIST_TABLE_BASE, 'min-w-[640px]')}>
                  <thead>
                    <tr className={LIST_TABLE_HEAD_ROW}>
                      <th className={listTableThClass()}>{t('colWhen')}</th>
                      <th className={listTableThClass()}>
                        {t('colMovementType')}
                      </th>
                      <th className={listTableThClass()}>
                        {t('colMovementQty')}
                      </th>
                      <th className={listTableThClass()}>{t('colBalance')}</th>
                      <th className={listTableThClass()}>{t('colReason')}</th>
                      <th className={listTableThClass()}>{t('colBy')}</th>
                    </tr>
                  </thead>
                  <tbody className={LIST_TABLE_BODY}>
                    {movements.map((row) => {
                      const signed =
                        row.direction === 'out'
                          ? `−${row.quantity}`
                          : `+${row.quantity}`
                      return (
                        <tr key={row.id} className={LIST_TABLE_ROW}>
                          <td className={listTableTdClass()}>
                            {formatWhen(row.createdAt, locale)}
                          </td>
                          <td className={listTableTdClass()}>
                            {t(`movementType_${row.type}`)}
                          </td>
                          <td
                            className={cn(
                              listTableTdClass(),
                              'tabular-nums',
                              row.direction === 'out' && 'text-hisabi-error',
                            )}
                          >
                            {signed} {row.unitLabel}
                          </td>
                          <td className={cn(listTableTdClass(), 'tabular-nums')}>
                            {row.quantityBefore} → {row.quantityAfter}
                          </td>
                          <td className={listTableTdClass()}>
                            {row.reason || '—'}
                          </td>
                          <td className={listTableTdClass()}>
                            {row.createdByName || '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-hisabi-md border-t border-hisabi-outline-variant/20 bg-slate-50/50 p-hisabi-md text-xs font-medium text-hisabi-on-surface-variant sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-hisabi-lg">
                  <div className="flex items-center gap-2">
                    <span>{t('rowsPerPage')}</span>
                    <select
                      className="type-label-sm cursor-pointer border-none bg-transparent py-0 pe-6 ps-1 font-bold text-hisabi-on-surface focus:ring-0"
                      aria-label={t('rowsPerPageAria')}
                      value={pageSize}
                      disabled={listBusy}
                      onChange={(e) => {
                        setMovementsLimit(Number(e.target.value))
                        setMovementsPage(1)
                      }}
                    >
                      {MOVEMENTS_PAGE_SIZE_OPTIONS.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                  <span>
                    {total === 0
                      ? t('rangeEmpty')
                      : t('range', {
                          from: start + 1,
                          to: start + movements.length,
                          total,
                        })}
                  </span>
                </div>
                <div className="flex items-center justify-center gap-2 sm:justify-end">
                  <button
                    type="button"
                    disabled={safePage <= 1 || listBusy}
                    className="cursor-pointer rounded-lg border border-transparent p-2 text-slate-400 transition-all hover:border-hisabi-outline-variant/30 hover:bg-white hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label={t('pageFirst')}
                    onClick={() => setMovementsPage(1)}
                  >
                    <ChevronsLeft className="size-5" />
                  </button>
                  <button
                    type="button"
                    disabled={safePage <= 1 || listBusy}
                    className="cursor-pointer rounded-lg border border-transparent p-2 text-slate-400 transition-all hover:border-hisabi-outline-variant/30 hover:bg-white hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label={t('pagePrev')}
                    onClick={() =>
                      setMovementsPage((p) => Math.max(1, p - 1))
                    }
                  >
                    <ChevronLeft className="size-5 rtl:rotate-180" />
                  </button>
                  {paginationItems.map((item, idx) =>
                    item === 'ellipsis' ? (
                      <span
                        key={`e-${idx}`}
                        className="px-1 text-slate-400"
                        aria-hidden
                      >
                        …
                      </span>
                    ) : (
                      <button
                        key={item}
                        type="button"
                        disabled={listBusy}
                        aria-current={item === safePage ? 'page' : undefined}
                        className={cn(
                          'type-label-sm min-w-8 cursor-pointer rounded-lg px-2 py-1.5 font-bold transition-all disabled:cursor-not-allowed disabled:opacity-30',
                          item === safePage
                            ? 'bg-white text-hisabi-primary shadow-sm'
                            : 'text-slate-400 hover:bg-white hover:text-hisabi-on-surface',
                        )}
                        onClick={() => setMovementsPage(item)}
                      >
                        {item}
                      </button>
                    ),
                  )}
                  <button
                    type="button"
                    disabled={safePage >= totalPages || listBusy}
                    className="cursor-pointer rounded-lg border border-transparent p-2 text-slate-400 transition-all hover:border-hisabi-outline-variant/30 hover:bg-white hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label={t('pageNext')}
                    onClick={() =>
                      setMovementsPage((p) => Math.min(totalPages, p + 1))
                    }
                  >
                    <ChevronRight className="size-5 rtl:rotate-180" />
                  </button>
                  <button
                    type="button"
                    disabled={safePage >= totalPages || listBusy}
                    className="cursor-pointer rounded-lg border border-transparent p-2 text-slate-400 transition-all hover:border-hisabi-outline-variant/30 hover:bg-white hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label={t('pageLast')}
                    onClick={() => setMovementsPage(totalPages)}
                  >
                    <ChevronsRight className="size-5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </SettingsSection>
      </div>

      {!isDeleted ? (
        <StockAdjustSheet
          open={adjustOpen}
          onOpenChange={setAdjustOpen}
          item={item}
          displayName={displayName}
          onSuccess={() => {
            setMovementsPage(1)
            void itemQuery.refetch()
            void queryClient.invalidateQueries({
              queryKey: ['stock', 'item', itemId, 'movements'],
            })
            router.refresh()
          }}
        />
      ) : null}
    </div>
  )
}
