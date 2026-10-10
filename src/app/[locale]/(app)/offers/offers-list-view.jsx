'use client'

import { useMutation } from '@tanstack/react-query'
import {
  BadgePercent,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Pencil,
  Plus,
  Power,
  Trash2,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  formatMoney,
  formatPercent,
  formatRiyadhDateTime,
  weekdayNames,
} from './offer-format'
import { HisabiStatusModal } from '@/components/hisabi-status-modal'
import { ListTableToolbar } from '@/components/list-views/list-table-toolbar'
import { useAppAbility } from '@/components/rbac/ability-provider'
import {
  ActionIconButton,
  ActionIconLink,
} from '@/components/row-actions/action-icon-button'
import { Link, usePathname, useRouter } from '@/i18n/navigation'
import { authDelete, authPatch } from '@/lib/api/auth-client'
import { toastAuthApiError } from '@/lib/api/toast-auth-api-error'
import { buildPaginationItems } from '@/lib/list-views/build-pagination-items'
import {
  LIST_PAGE_HEADER_ACTIONS,
  listTableToolbarSelectClass,
} from '@/lib/list-views/list-page-toolbar-styles'
import {
  LIST_TABLE_ACTIONS_INNER,
  LIST_TABLE_BASE,
  LIST_TABLE_BODY,
  LIST_TABLE_HEAD_ROW,
  LIST_TABLE_ROW,
  LIST_TABLE_SCROLL_WRAP,
  listTableActionsTdClass,
  listTableTdClass,
  listTableThClass,
} from '@/lib/list-views/list-table-styles'
import { useUrlSyncedSearchInput } from '@/lib/list-views/use-url-synced-search-input'
import { cn } from '@/lib/utils'

const PAGE_SIZE_OPTIONS = [10, 25, 50]

const STATUS_BADGE_CLASS = {
  live: 'bg-green-100 text-green-700',
  scheduled: 'bg-amber-100 text-amber-800',
  inactive: 'bg-slate-100 text-slate-600',
  ended: 'bg-red-50 text-red-700',
}

const STATUS_LABEL_KEY = {
  live: 'statusLive',
  scheduled: 'statusScheduled',
  inactive: 'statusInactive',
  ended: 'statusEnded',
}

const KIND_LABEL_KEY = {
  DISCOUNT: 'kindDiscount',
  BUY_X_GET_Y: 'kindBuyXGetY',
  COMBO: 'kindCombo',
}

const PAGER_BTN_CLASS =
  'cursor-pointer rounded-lg border border-transparent p-2 text-slate-400 transition-all hover:border-hisabi-outline-variant/30 hover:bg-white hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-30'

/**
 * @param {{
 *   offers: Array<Record<string, any>>
 *   pagination: { page: number, limit: number, total: number, totalPages: number }
 *   filters: { search: string, kind: string, status: string }
 * }} props
 */
export function OffersListView({ offers, pagination, filters }) {
  const t = useTranslations('Offers')
  const tErr = useTranslations('AuthErrors')
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const ability = useAppAbility()
  const canCreate = ability.can('create', 'Offer')
  const canUpdate = ability.can('update', 'Offer')
  const canDelete = ability.can('delete', 'Offer')
  const [isPending, startTransition] = useTransition()
  const [deleteTarget, setDeleteTarget] = useState(
    /** @type {Record<string, any> | null} */ (null),
  )

  const {
    searchInput,
    setSearchInput,
    debouncedSearch,
    lastPushedSearch: lastPushedSearchRef,
  } =
    useUrlSyncedSearchInput(filters.search)

  const pageSize = pagination.limit || 10

  /**
   * @param {{ page?: number, limit?: number, search?: string, kind?: string, status?: string }} patch
   */
  function pushFilters(patch) {
    const next = {
      search: filters.search,
      kind: filters.kind,
      status: filters.status,
      limit: pageSize,
      page: 1,
      ...patch,
    }
    const params = new URLSearchParams()
    params.set('page', String(next.page))
    params.set('limit', String(next.limit))
    if (next.search) params.set('search', next.search)
    if (next.kind) params.set('kind', next.kind)
    if (next.status) params.set('status', next.status)
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
  }

  useEffect(() => {
    if (debouncedSearch === lastPushedSearchRef.current) return
    lastPushedSearchRef.current = debouncedSearch
    pushFilters({ page: 1, search: debouncedSearch })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- URL sync from debounced search only
  }, [debouncedSearch])

  const toggleMutation = useMutation({
    mutationFn: (/** @type {Record<string, any>} */ row) =>
      authPatch(`/offers/${row.id}`, { active: !row.active }),
    onSuccess: (_d, row) => {
      toast.success(row.active ? t('deactivated') : t('activated'))
      router.refresh()
    },
    onError: (err) => toastAuthApiError(tErr, err),
  })

  const deleteMutation = useMutation({
    mutationFn: (/** @type {string} */ id) => authDelete(`/offers/${id}`),
    onSuccess: () => {
      toast.success(t('deleted'))
      setDeleteTarget(null)
      router.refresh()
    },
    onError: (err) => toastAuthApiError(tErr, err),
  })

  const weekdays = useMemo(() => weekdayNames(locale), [locale])

  /** @param {{ nameAr?: string, nameEn?: string | null }} row */
  function displayName(row) {
    return locale === 'ar'
      ? row.nameAr || row.nameEn || ''
      : row.nameEn?.trim() || row.nameAr || ''
  }

  /** @param {Record<string, any>} item */
  function itemName(item) {
    return locale === 'ar'
      ? item.menuItemNameAr || item.menuItemNameEn || ''
      : item.menuItemNameEn?.trim() || item.menuItemNameAr || ''
  }

  /** @param {Array<Record<string, any>>} items */
  function itemList(items, withQty) {
    const names = items.map((it) =>
      withQty && it.quantity > 1
        ? t('itemQty', { qty: it.quantity, name: itemName(it) })
        : itemName(it),
    )
    if (names.length <= 2) return names.join(t('listSeparator'))
    return t('itemsMore', {
      names: names.slice(0, 2).join(t('listSeparator')),
      count: names.length - 2,
    })
  }

  /** @param {Record<string, any>} row */
  function valueSummary(row) {
    const items = Array.isArray(row.items) ? row.items : []
    if (row.kind === 'DISCOUNT') {
      const pct = row.discountType === 'PERCENTAGE'
      const value = pct
        ? formatPercent(row.discountValue)
        : formatMoney(row.discountValue)
      const targets = items.filter((it) => it.role === 'TARGET')
      if (row.appliesToAllItems || targets.length === 0) {
        return pct
          ? t('valueDiscountPctAll', { value })
          : t('valueDiscountFixedAll', { value })
      }
      const names = itemList(targets, false)
      return pct
        ? t('valueDiscountPctItems', { value, items: names })
        : t('valueDiscountFixedItems', { value, items: names })
    }
    if (row.kind === 'BUY_X_GET_Y') {
      const buys = items.filter((it) => it.role === 'BUY')
      const gets = items.filter((it) => it.role === 'GET')
      const allFree = gets.every(
        (it) => it.discountPercent == null || Number(it.discountPercent) >= 100,
      )
      const buy = itemList(buys, true)
      const get = itemList(gets, true)
      return allFree
        ? t('valueBxgyFree', { buy, get })
        : t('valueBxgyPercent', {
            buy,
            get,
            pct: formatPercent(gets[0]?.discountPercent ?? '100'),
          })
    }
    if (row.kind === 'COMBO') {
      const count = items.reduce(
        (sum, it) => sum + (Number(it.quantity) || 1),
        0,
      )
      return t('valueCombo', { count, price: formatMoney(row.comboPrice) })
    }
    return '—'
  }

  /** @param {Record<string, any>} row */
  function scheduleSummary(row) {
    /** @type {string[]} */
    const parts = []
    if (row.startsAt && row.endsAt) {
      parts.push(
        t('scheduleRange', {
          start: formatRiyadhDateTime(row.startsAt, locale),
          end: formatRiyadhDateTime(row.endsAt, locale),
        }),
      )
    } else if (row.startsAt) {
      parts.push(
        t('scheduleFrom', { start: formatRiyadhDateTime(row.startsAt, locale) }),
      )
    } else if (row.endsAt) {
      parts.push(
        t('scheduleUntil', { end: formatRiyadhDateTime(row.endsAt, locale) }),
      )
    }
    if (row.dailyStartTime && row.dailyEndTime) {
      parts.push(
        t('scheduleDaily', { from: row.dailyStartTime, to: row.dailyEndTime }),
      )
    }
    const days = Array.isArray(row.weekdays) ? row.weekdays : []
    if (days.length > 0 && days.length < 7) {
      parts.push(
        [...days]
          .sort((a, b) => a - b)
          .map((d) => weekdays[d])
          .join(t('listSeparator')),
      )
    }
    return parts.length > 0 ? parts : [t('scheduleAlways')]
  }

  /** @param {Record<string, any>} row */
  function usesLines(row) {
    const used = typeof row.usedTotal === 'number' ? row.usedTotal : 0
    const lines = [
      row.totalUsageLimit == null
        ? t('usesUnlimited', { used })
        : t('usesOfLimit', { used, limit: row.totalUsageLimit }),
    ]
    if (row.dailyUsageLimit != null) {
      lines.push(
        t('usesToday', {
          used: typeof row.usedToday === 'number' ? row.usedToday : 0,
          limit: row.dailyUsageLimit,
        }),
      )
    }
    return lines
  }

  const hasFilters = Boolean(filters.search || filters.kind || filters.status)

  const safePage = Math.max(1, pagination.page || 1)
  const totalPages = Math.max(1, pagination.totalPages || 1)
  const total = pagination.total || 0
  const start = total === 0 ? 0 : (safePage - 1) * pageSize
  const paginationItems = useMemo(
    () => buildPaginationItems(safePage, totalPages),
    [safePage, totalPages],
  )
  const listBusy = isPending
  const showActions = canUpdate || canDelete
  const colCount = 6 + (showActions ? 1 : 0)

  return (
    <div className={cn('mx-auto max-w-hisabi-container', listBusy && 'opacity-70')}>
      <div className="mb-hisabi-xl flex flex-col gap-hisabi-lg min-[1251px]:flex-row min-[1251px]:items-end min-[1251px]:justify-between">
        <div className="space-y-1">
          <h1 className="type-headline-xl text-hisabi-on-surface">{t('title')}</h1>
          <p className="type-body-md text-hisabi-on-surface-variant max-w-lg">
            {t('subtitle')}
          </p>
        </div>
        <div className={LIST_PAGE_HEADER_ACTIONS}>
          {canCreate ? (
            <Link
              href="/offers/new"
              className="type-label-md inline-flex min-h-[44px] shrink-0 cursor-pointer items-center justify-center gap-hisabi-sm rounded-xl border-none bg-hisabi-gold-muted px-hisabi-lg py-2.5 font-bold text-hisabi-on-secondary-container shadow-sm transition-all hover:bg-hisabi-gold-muted-hover active:scale-[0.98]"
            >
              <Plus className="size-5 shrink-0" aria-hidden />
              {t('addOffer')}
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mb-hisabi-xl overflow-hidden rounded-xl border border-hisabi-outline-variant/30 bg-white shadow-sm">
        <ListTableToolbar
          summary={
            listBusy
              ? t('loadingList')
              : t('showingCount', { shown: offers.length, total })
          }
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder={t('searchPlaceholder')}
        >
          <select
            aria-label={t('filterKind')}
            value={filters.kind}
            disabled={listBusy}
            onChange={(e) => pushFilters({ page: 1, kind: e.target.value })}
            className={listTableToolbarSelectClass()}
          >
            <option value="">{t('filterKindAll')}</option>
            <option value="DISCOUNT">{t('kindDiscount')}</option>
            <option value="BUY_X_GET_Y">{t('kindBuyXGetY')}</option>
            <option value="COMBO">{t('kindCombo')}</option>
          </select>
          <select
            aria-label={t('filterStatus')}
            value={filters.status}
            disabled={listBusy}
            onChange={(e) => pushFilters({ page: 1, status: e.target.value })}
            className={listTableToolbarSelectClass()}
          >
            <option value="">{t('filterStatusAll')}</option>
            <option value="live">{t('statusLive')}</option>
            <option value="scheduled">{t('statusScheduled')}</option>
            <option value="inactive">{t('statusInactive')}</option>
            <option value="ended">{t('statusEnded')}</option>
          </select>
        </ListTableToolbar>

        <div className={LIST_TABLE_SCROLL_WRAP}>
          <table className={cn(LIST_TABLE_BASE, 'min-w-[960px]')}>
            <thead>
              <tr className={LIST_TABLE_HEAD_ROW}>
                <th scope="col" className={listTableThClass(undefined, true)}>
                  {t('colName')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('colType')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('colValue')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('colSchedule')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('colStatus')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('colUses')}
                </th>
                {showActions ? (
                  <th scope="col" className={listTableThClass()}>
                    {t('colActions')}
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody className={LIST_TABLE_BODY}>
              {offers.length === 0 ? (
                <tr>
                  <td
                    colSpan={colCount}
                    className="type-body-md text-hisabi-on-surface-variant px-hisabi-lg py-12 text-center"
                  >
                    {hasFilters ? (
                      t('emptyFiltered')
                    ) : (
                      <div className="flex flex-col items-center gap-hisabi-md">
                        <span
                          className="flex size-12 items-center justify-center rounded-xl bg-hisabi-secondary-fixed text-hisabi-primary"
                          aria-hidden
                        >
                          <BadgePercent className="size-6" aria-hidden />
                        </span>
                        <p className="type-body-md font-semibold text-hisabi-on-surface">
                          {t('emptyTitle')}
                        </p>
                        <p className="type-body-sm max-w-md">{t('emptyBody')}</p>
                        {canCreate ? (
                          <Link
                            href="/offers/new"
                            className="type-label-md inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-hisabi-sm rounded-xl bg-hisabi-gold-muted px-hisabi-lg py-2.5 font-bold text-hisabi-on-secondary-container shadow-sm transition-all hover:bg-hisabi-gold-muted-hover active:scale-[0.98]"
                          >
                            <Plus className="size-5 shrink-0" aria-hidden />
                            {t('emptyCta')}
                          </Link>
                        ) : null}
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                offers.map((row) => {
                  const name = displayName(row)
                  const status =
                    typeof row.status === 'string' ? row.status : 'inactive'
                  return (
                    <tr key={row.id} className={LIST_TABLE_ROW}>
                      <td className={listTableTdClass(undefined, true)}>
                        {canUpdate ? (
                          <Link
                            href={`/offers/${row.id}/edit`}
                            className="type-body-md text-start font-bold text-hisabi-on-surface hover:text-hisabi-primary hover:underline"
                          >
                            {name}
                          </Link>
                        ) : (
                          <span className="type-body-md font-bold text-hisabi-on-surface">
                            {name}
                          </span>
                        )}
                      </td>
                      <td
                        className={listTableTdClass(
                          'type-body-sm text-hisabi-on-surface',
                        )}
                      >
                        {KIND_LABEL_KEY[row.kind]
                          ? t(KIND_LABEL_KEY[row.kind])
                          : '—'}
                      </td>
                      <td
                        className={listTableTdClass(
                          'type-body-sm text-hisabi-on-surface max-w-xs whitespace-normal',
                        )}
                      >
                        {valueSummary(row)}
                      </td>
                      <td
                        className={listTableTdClass(
                          'type-body-sm text-hisabi-on-surface-variant whitespace-normal',
                        )}
                      >
                        <div className="flex flex-col gap-0.5">
                          {scheduleSummary(row).map((line) => (
                            <span key={line}>{line}</span>
                          ))}
                        </div>
                      </td>
                      <td className={listTableTdClass()}>
                        <span
                          className={cn(
                            'type-label-sm inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold',
                            STATUS_BADGE_CLASS[status] ??
                              STATUS_BADGE_CLASS.inactive,
                          )}
                        >
                          {t(STATUS_LABEL_KEY[status] ?? 'statusInactive')}
                        </span>
                      </td>
                      <td
                        className={listTableTdClass(
                          'type-body-sm text-hisabi-on-surface tabular-nums',
                        )}
                      >
                        <div className="flex flex-col gap-0.5">
                          {usesLines(row).map((line) => (
                            <span key={line}>{line}</span>
                          ))}
                        </div>
                      </td>
                      {showActions ? (
                        <td className={listTableActionsTdClass()}>
                          <div className={LIST_TABLE_ACTIONS_INNER}>
                            {canUpdate ? (
                              <ActionIconLink
                                label={t('edit')}
                                href={`/offers/${row.id}/edit`}
                                className="hover:text-hisabi-secondary"
                              >
                                <Pencil className="size-5" aria-hidden />
                              </ActionIconLink>
                            ) : null}
                            {canUpdate ? (
                              <ActionIconButton
                                label={row.active ? t('deactivate') : t('activate')}
                                disabled={toggleMutation.isPending}
                                onClick={() => toggleMutation.mutate(row)}
                                className={
                                  row.active
                                    ? 'hover:text-hisabi-error'
                                    : 'hover:text-hisabi-primary'
                                }
                              >
                                <Power className="size-5" aria-hidden />
                              </ActionIconButton>
                            ) : null}
                            {canDelete ? (
                              <ActionIconButton
                                label={t('delete')}
                                disabled={deleteMutation.isPending}
                                onClick={() => setDeleteTarget(row)}
                                className="hover:text-hisabi-error"
                              >
                                <Trash2 className="size-5" aria-hidden />
                              </ActionIconButton>
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="text-hisabi-on-surface-variant flex flex-col gap-hisabi-md border-t border-hisabi-outline-variant/20 bg-slate-50/50 p-hisabi-md text-xs font-medium sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-hisabi-lg">
            <div className="flex items-center gap-2">
              <span>{t('rowsPerPage')}</span>
              <select
                className="type-label-sm cursor-pointer border-none bg-transparent py-0 ps-1 pe-6 font-bold text-hisabi-on-surface focus:ring-0"
                aria-label={t('rowsPerPageAria')}
                value={pageSize}
                disabled={listBusy}
                onChange={(e) =>
                  pushFilters({ page: 1, limit: Number(e.target.value) })
                }
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
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
                    to: start + offers.length,
                    total,
                  })}
            </span>
          </div>
          <div className="flex items-center justify-center gap-2 sm:justify-end">
            <button
              type="button"
              disabled={safePage <= 1 || listBusy}
              className={PAGER_BTN_CLASS}
              aria-label={t('pageFirst')}
              onClick={() => pushFilters({ page: 1 })}
            >
              <ChevronsLeft className="size-5 rtl:rotate-180" />
            </button>
            <button
              type="button"
              disabled={safePage <= 1 || listBusy}
              className={PAGER_BTN_CLASS}
              aria-label={t('pagePrev')}
              onClick={() => pushFilters({ page: Math.max(1, safePage - 1) })}
            >
              <ChevronLeft className="size-5 rtl:rotate-180" />
            </button>
            <div className="flex items-center gap-1">
              {paginationItems.map((item, idx) =>
                item === 'ellipsis' ? (
                  <span key={`e-${idx}`} className="px-2 text-slate-400">
                    ...
                  </span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    disabled={listBusy}
                    onClick={() => pushFilters({ page: item })}
                    className={cn(
                      'type-label-sm flex size-8 cursor-pointer items-center justify-center rounded-lg text-xs font-bold transition-colors',
                      item === safePage
                        ? 'bg-hisabi-primary text-white'
                        : 'border border-transparent text-slate-600 hover:border-hisabi-outline-variant/30 hover:bg-white',
                    )}
                  >
                    {item}
                  </button>
                ),
              )}
            </div>
            <button
              type="button"
              disabled={safePage >= totalPages || listBusy}
              className={PAGER_BTN_CLASS}
              aria-label={t('pageNext')}
              onClick={() =>
                pushFilters({ page: Math.min(totalPages, safePage + 1) })
              }
            >
              <ChevronRight className="size-5 rtl:rotate-180" />
            </button>
            <button
              type="button"
              disabled={safePage >= totalPages || listBusy}
              className={PAGER_BTN_CLASS}
              aria-label={t('pageLast')}
              onClick={() => pushFilters({ page: totalPages })}
            >
              <ChevronsRight className="size-5 rtl:rotate-180" />
            </button>
          </div>
        </div>
      </div>

      <HisabiStatusModal
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        variant="error"
        title={t('deleteTitle')}
        description={
          deleteTarget
            ? t('deleteBody', { name: displayName(deleteTarget) })
            : undefined
        }
        primaryLabel={t('delete')}
        secondaryLabel={t('cancel')}
        primaryPending={deleteMutation.isPending}
        onPrimary={() => {
          if (deleteTarget) deleteMutation.mutate(String(deleteTarget.id))
        }}
      />
    </div>
  )
}
