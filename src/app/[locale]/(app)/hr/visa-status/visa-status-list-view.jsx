'use client'

import { useQuery } from '@tanstack/react-query'
import {
  Eye,
  Loader2,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { NoCompanyProfileBanner } from '@/components/clients/no-company-profile-banner'
import { ListTablePagination } from '@/components/list-views/list-table-pagination'
import { ListTableToolbar } from '@/components/list-views/list-table-toolbar'
import { ActionIconButton } from '@/components/row-actions/action-icon-button'
import { useRouter } from '@/i18n/navigation'
import { authGet } from '@/lib/api/auth-client'
import { buildListQueryUrl } from '@/lib/list-views/build-list-query-url'
import { useDebouncedValue } from '@/lib/list-views/use-debounced-value'
import { useListPageFromUrl, useResetListPageOnChange } from '@/lib/list-views/use-list-page-from-url'
import { useServerPaginatedRows } from '@/lib/list-views/use-server-paginated-rows'
import {
  LIST_TABLE_BASE,
  LIST_TABLE_BODY,
  LIST_TABLE_HEAD_ROW,
  LIST_TABLE_ROW,
  LIST_TABLE_SCROLL_WRAP,
  listTableTdClass,
  listTableActionsTdClass,
  listTableThClass,
} from '@/lib/list-views/list-table-styles'
import { cn } from '@/lib/utils'
import { getVisaExpiryStatus } from '@/lib/hr/visa-expiry-status'
import { useAuthStore } from '@/stores/auth-store'

/** @param {number | null | undefined} days */
function daysLeftBadgeClass(days) {
  const status = getVisaExpiryStatus(days == null ? null : Number(days))
  if (status === 'expired')
    return 'inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 font-bold text-red-700'
  if (status === 'expiring')
    return 'inline-flex items-center rounded-full bg-orange-100 px-2.5 py-0.5 font-semibold text-orange-700'
  return 'text-hisabi-on-surface'
}

function VisaStatusListWithoutCompanyProfile() {
  const t = useTranslations('HR')
  return (
    <div className="mx-auto max-w-hisabi-container">
      <NoCompanyProfileBanner className="mb-hisabi-lg" />
      <div className="pointer-events-none select-none opacity-40">
        <div className="mb-hisabi-xl space-y-1">
          <h1 className="type-headline-xl text-hisabi-on-surface">{t('visaStatusTitle')}</h1>
          <p className="type-body-md text-hisabi-on-surface-variant max-w-lg">
            {t('visaStatusSubtitle')}
          </p>
        </div>
      </div>
    </div>
  )
}

function VisaStatusListWithCompanyProfile() {
  const t = useTranslations('HR')
  const locale = useLocale()
  const uiLocale = locale === 'ar' ? 'ar-SA' : 'en-US'
  const router = useRouter()
  const activeBusinessProfileId = useAuthStore(
    (s) => s.user?.activeBusinessProfileId ?? null,
  )
  const prevActiveProfileRef = useRef(
    /** @type {string | null | undefined} */ (undefined),
  )

  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebouncedValue(searchInput)
  const { page, setPage, resetPage } = useListPageFromUrl()
  const pageSize = 10

  const { data, isPending, isFetching, isError, refetch } = useQuery({
    queryKey: ['hr-visa-status', debouncedSearch, page, pageSize, activeBusinessProfileId],
    queryFn: async () =>
      authGet(
        buildListQueryUrl('/hr/visa-status', {
          search: debouncedSearch,
          page,
          limit: pageSize,
        }),
      ),
    enabled: Boolean(activeBusinessProfileId),
  })

  const busy = isPending || isFetching
  const rows = useMemo(
    () => /** @type {Array<Record<string, unknown>>} */ (data?.items ?? []),
    [data?.items],
  )

  useResetListPageOnChange(resetPage, [debouncedSearch])

  useEffect(() => {
    const prev = prevActiveProfileRef.current
    prevActiveProfileRef.current = activeBusinessProfileId
    if (prev === undefined) return
    if (prev === activeBusinessProfileId) return
    resetPage()
  }, [activeBusinessProfileId, resetPage])

  const { total, totalPages, safePage } = useServerPaginatedRows(page, data?.pagination)
  const pageRows = rows

  const formatDate = useCallback(
    (iso) => {
      if (!iso) return '—'
      return new Intl.DateTimeFormat(uiLocale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(new Date(String(iso)))
    },
    [uiLocale],
  )

  return (
    <div className="mx-auto max-w-hisabi-container">
      {isError ? (
        <div
          role="alert"
          className="mb-hisabi-lg flex flex-col gap-hisabi-md rounded-xl border border-red-200 bg-red-50/90 p-hisabi-lg text-red-900 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="type-body-md">{t('loadError')}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="type-label-md shrink-0 rounded-lg bg-white px-hisabi-md py-2 font-semibold text-red-800 shadow-sm hover:bg-red-100"
          >
            {t('retryLoad')}
          </button>
        </div>
      ) : null}

      <div className="mb-hisabi-xl space-y-1">
        <h1 className="type-headline-xl text-hisabi-on-surface">{t('visaStatusTitle')}</h1>
        <p className="type-body-md text-hisabi-on-surface-variant max-w-lg">
          {t('visaStatusSubtitle')}
        </p>
      </div>

      <div className="mb-hisabi-xl overflow-hidden rounded-xl border border-hisabi-outline-variant/30 bg-white shadow-sm">
        <ListTableToolbar
          summary={`${pageRows.length} / ${total} ${t('records')}`}
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder={t('searchVisaPlaceholder')}
        />

        <div className={LIST_TABLE_SCROLL_WRAP}>
          <table className={cn(LIST_TABLE_BASE, 'min-w-[900px]')}>
            <thead>
              <tr className={LIST_TABLE_HEAD_ROW}>
                <th className={listTableThClass(undefined, true)}>
                  {t('colEmployeeName')}
                </th>
                <th className={listTableThClass()}>{t('colContact')}</th>
                <th className={listTableThClass()}>{t('colVisaIssueDate')}</th>
                <th className={listTableThClass()}>{t('colVisaEntryDate')}</th>
                <th className={listTableThClass()}>{t('colVisaExpiry')}</th>
                <th className={listTableThClass()}>{t('colDaysLeft')}</th>
                <th className={listTableThClass()}>{t('colActions')}</th>
              </tr>
            </thead>
            <tbody className={LIST_TABLE_BODY}>
              {busy && rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-hisabi-lg py-16 text-center">
                    <Loader2 className="mx-auto size-8 animate-spin text-hisabi-primary" aria-hidden />
                  </td>
                </tr>
              ) : pageRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="type-body-md text-hisabi-on-surface-variant px-hisabi-lg py-12 text-center"
                  >
                    {t('empty')}
                  </td>
                </tr>
              ) : (
                pageRows.map((row) => {
                  const contact =
                    String(row.mobilePersonal ?? '').trim() ||
                    String(row.mobileOfficial ?? '').trim() ||
                    '—'
                  const daysLeft = row.daysLeft
                  return (
                    <tr key={String(row.id)} className={LIST_TABLE_ROW}>
                      <td className={listTableTdClass('type-body-sm text-hisabi-on-surface font-semibold', true)}>
                        {String(row.name ?? '')}
                      </td>
                      <td className={listTableTdClass('type-body-sm text-hisabi-on-surface-variant')} dir="ltr">
                        {contact}
                      </td>
                      <td className={listTableTdClass('type-body-sm')}>
                        {formatDate(row.visaIssueDate)}
                      </td>
                      <td className={listTableTdClass('type-body-sm')}>
                        {formatDate(row.visaEntryDate)}
                      </td>
                      <td className={listTableTdClass('type-body-sm')}>
                        {formatDate(row.visaExpiry)}
                      </td>
                      <td className={listTableTdClass('type-body-sm')}>
                        {daysLeft == null ? (
                          '—'
                        ) : (
                          <span className={daysLeftBadgeClass(daysLeft)}>{String(daysLeft)}</span>
                        )}
                      </td>
                      <td className={listTableActionsTdClass()}>
                        <ActionIconButton
                          label={t('view')}
                          onClick={() => router.push(`/hr/employees/${row.id}`)}
                          className="hover:text-hisabi-primary"
                        >
                          <Eye className="size-5" aria-hidden />
                        </ActionIconButton>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <ListTablePagination
          total={total}
          safePage={safePage}
          totalPages={totalPages}
          recordsLabel={t('records')}
          onPageChange={setPage}
        />
      </div>
    </div>
  )
}

/** @param {{ hasBusinessProfile?: boolean }} props */
export function VisaStatusListView({ hasBusinessProfile }) {
  if (hasBusinessProfile !== true) {
    return <VisaStatusListWithoutCompanyProfile />
  }
  return <VisaStatusListWithCompanyProfile />
}
