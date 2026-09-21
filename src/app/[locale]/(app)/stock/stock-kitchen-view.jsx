'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ClipboardList, PackageCheck, PackagePlus } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { AppLoader } from '@/components/app-loader'
import { AuthSubmitButton } from '@/components/auth/auth-submit-button'
import { HisabiStatusModal } from '@/components/hisabi-status-modal'
import { useAppAbility } from '@/components/rbac/ability-provider'
import { SettingsSection } from '@/components/settings/settings-page-shell'
import { PageBackButton } from '@/components/shared/page-back-button'
import { RequiredMark } from '@/components/ui/required-mark'
import { AuthApiError, authGet, authPost } from '@/lib/api/auth-client'
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

/**
 * @param {{
 *   initialAllocations: Array<Record<string, unknown>>
 *   stockItems: Array<Record<string, unknown>>
 * }} props
 */
export function StockKitchenView({ initialAllocations, stockItems }) {
  const t = useTranslations('Stock')
  const tErr = useTranslations('AuthErrors')
  const locale = useLocale()
  const ability = useAppAbility()
  const canUpdate = ability.can('update', 'StockItem')
  const queryClient = useQueryClient()

  const [stockItemId, setStockItemId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [issueConfirm, setIssueConfirm] = useState(
    /** @type {null | { markOldConsumed: boolean }} */ (null),
  )

  const listQuery = useQuery({
    queryKey: ['stock', 'kitchen', 'open'],
    queryFn: async () => {
      const d = await authGet('/stock/kitchen')
      return Array.isArray(d.allocations) ? d.allocations : []
    },
    initialData: initialAllocations,
  })

  const allocations = listQuery.data ?? []

  const selectedItem = useMemo(
    () => stockItems.find((s) => s.id === stockItemId) ?? null,
    [stockItems, stockItemId],
  )

  const openForSelected = useMemo(
    () => allocations.find((a) => a.stockItemId === stockItemId) ?? null,
    [allocations, stockItemId],
  )

  const issueMutation = useMutation({
    mutationFn: ({ markOldConsumed }) =>
      authPost('/stock/kitchen/issue', {
        stockItemId,
        quantity: quantity.trim(),
        markOldConsumed: markOldConsumed === true,
      }),
    onSuccess: (data) => {
      toast.success(
        data.markedOldConsumed
          ? t('kitchenIssuedAfterConsumed')
          : data.toppedUp
            ? t('kitchenToppedUp')
            : t('kitchenIssued'),
      )
      setQuantity('')
      setIssueConfirm(null)
      queryClient.setQueryData(
        ['stock', 'kitchen', 'open'],
        data.allocations ?? [],
      )
      void queryClient.invalidateQueries({ queryKey: ['stock', 'items'] })
    },
    onError: (err) => {
      const code = err instanceof AuthApiError ? err.code : undefined
      toast.error(
        code && tErr.has(code) ? tErr(code) : t('errorIssueKitchenFailed'),
      )
    },
  })

  const markMutation = useMutation({
    mutationFn: (allocationId) =>
      authPost('/stock/kitchen/mark-consumed', { allocationId }),
    onSuccess: (data) => {
      toast.success(t('kitchenMarkedConsumed'))
      queryClient.setQueryData(
        ['stock', 'kitchen', 'open'],
        data.allocations ?? [],
      )
    },
    onError: (err) => {
      const code = err instanceof AuthApiError ? err.code : undefined
      toast.error(
        code && tErr.has(code) ? tErr(code) : t('errorMarkConsumedFailed'),
      )
    },
  })

  function itemLabel(stock) {
    if (!stock) return '—'
    if (locale === 'ar') return stock.nameAr || stock.nameEn || '—'
    return stock.nameEn || stock.nameAr || '—'
  }

  function submitIssue(e) {
    e.preventDefault()
    if (!stockItemId) {
      toast.error(t('kitchenPickItem'))
      return
    }
    if (!/^\d+(\.\d+)?$/.test(quantity.trim()) || Number(quantity) <= 0) {
      toast.error(t('errorQtyInvalid'))
      return
    }
    if (openForSelected) {
      setIssueConfirm({ markOldConsumed: false })
      return
    }
    issueMutation.mutate({ markOldConsumed: false })
  }

  return (
    <div className="mx-auto max-w-hisabi-container">
      <PageBackButton href="/stock" label={t('backToList')} />

      <div className="mb-hisabi-xl space-y-1">
        <h1 className="type-headline-xl text-hisabi-on-surface">
          {t('kitchenTitle')}
        </h1>
        <p className="type-body-md max-w-2xl text-hisabi-on-surface-variant">
          {t('kitchenSubtitle')}
        </p>
      </div>

      {listQuery.isLoading && !allocations.length ? (
        <div className="flex justify-center py-hisabi-xxl">
          <AppLoader />
        </div>
      ) : (
        <div className="space-y-hisabi-xl">
          {canUpdate ? (
            <SettingsSection title={t('kitchenIssueTitle')} icon={PackagePlus}>
              <form
                onSubmit={submitIssue}
                className="grid gap-hisabi-md sm:grid-cols-[1fr_1fr_auto]"
              >
                <label className="block space-y-1">
                  <span className="type-label-md text-hisabi-on-surface">
                    {t('kitchenItemLabel')}
                    <RequiredMark />
                  </span>
                  <select
                    className="type-body-md border-hisabi-outline-variant w-full rounded-xl border bg-white px-hisabi-md py-hisabi-btn"
                    value={stockItemId}
                    onChange={(e) => setStockItemId(e.target.value)}
                    required
                  >
                    <option value="">{t('kitchenItemPlaceholder')}</option>
                    {stockItems.map((s) => (
                      <option key={String(s.id)} value={String(s.id)}>
                        {itemLabel(s)}
                        {s.isBulk === true ? ` (${t('bulkBadge')})` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="type-label-md text-hisabi-on-surface">
                    {t('kitchenQtyLabel')}
                    <RequiredMark />
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="type-body-md border-hisabi-outline-variant w-full rounded-xl border bg-white px-hisabi-md py-hisabi-btn"
                    placeholder={t('kitchenQtyPlaceholder')}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    required
                  />
                  {selectedItem ? (
                    <span className="type-body-sm text-hisabi-on-surface-variant">
                      {stockUnitLabel(selectedItem.unit)}
                      {openForSelected
                        ? ` · ${t('kitchenOpenRemaining', {
                            qty: String(openForSelected.quantityRemaining),
                          })}`
                        : ''}
                    </span>
                  ) : null}
                </label>
                <div className="flex items-end">
                  <AuthSubmitButton
                    type="submit"
                    pending={issueMutation.isPending}
                    className="w-full sm:w-auto"
                  >
                    {t('kitchenIssueSubmit')}
                  </AuthSubmitButton>
                </div>
              </form>
            </SettingsSection>
          ) : null}

          <SettingsSection title={t('kitchenOpenTitle')} icon={ClipboardList}>
            {allocations.length === 0 ? (
              <p className="type-body-md text-hisabi-on-surface-variant">
                {t('kitchenOpenEmpty')}
              </p>
            ) : (
              <div className={LIST_TABLE_SCROLL_WRAP}>
                <table className={cn(LIST_TABLE_BASE, 'min-w-[720px]')}>
                  <thead>
                    <tr className={LIST_TABLE_HEAD_ROW}>
                      <th className={listTableThClass(undefined, true)}>
                        {t('colName')}
                      </th>
                      <th className={listTableThClass()}>{t('kitchenColIssued')}</th>
                      <th className={listTableThClass()}>{t('kitchenColUsed')}</th>
                      <th className={listTableThClass()}>
                        {t('kitchenColRemaining')}
                      </th>
                      <th className={listTableThClass()}>{t('kitchenColOpened')}</th>
                      {canUpdate ? (
                        <th className={listTableThClass()}>{t('colActions')}</th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody className={LIST_TABLE_BODY}>
                    {allocations.map((row) => {
                      const stock = row.stockItem
                      const unit = stockUnitLabel(stock?.unit)
                      return (
                        <tr key={String(row.id)} className={LIST_TABLE_ROW}>
                          <td className={listTableTdClass(undefined, true)}>
                            {itemLabel(stock)}
                            {row.isBulk === true ? (
                              <span className="type-label-sm text-hisabi-on-surface-variant ms-2">
                                ({t('bulkBadge')})
                              </span>
                            ) : null}
                          </td>
                          <td className={cn(listTableTdClass(), 'tabular-nums')}>
                            {String(row.quantityIssued)} {unit}
                          </td>
                          <td className={cn(listTableTdClass(), 'tabular-nums')}>
                            {String(row.quantityUsed)} {unit}
                          </td>
                          <td className={cn(listTableTdClass(), 'tabular-nums')}>
                            {String(row.quantityRemaining)} {unit}
                          </td>
                          <td className={listTableTdClass()}>
                            {formatWhen(String(row.openedAt), locale)}
                          </td>
                          {canUpdate ? (
                            <td className={listTableTdClass()}>
                              <button
                                type="button"
                                className="type-label-sm inline-flex cursor-pointer items-center gap-1 rounded-lg border border-hisabi-outline-variant/60 bg-white px-2 py-1 font-semibold hover:bg-hisabi-surface-container disabled:opacity-40"
                                disabled={markMutation.isPending}
                                onClick={() =>
                                  markMutation.mutate(String(row.id))
                                }
                              >
                                <PackageCheck
                                  className="size-3.5"
                                  aria-hidden
                                />
                                {t('kitchenMarkConsumed')}
                              </button>
                            </td>
                          ) : null}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SettingsSection>
        </div>
      )}

      <HisabiStatusModal
        open={Boolean(issueConfirm)}
        onOpenChange={(open) => {
          if (!open) setIssueConfirm(null)
        }}
        variant="warning"
        title={t('kitchenIssueConflictTitle')}
        description={t('kitchenIssueConflictBody', {
          name: itemLabel(openForSelected?.stockItem),
          remaining: String(openForSelected?.quantityRemaining ?? '0'),
        })}
        primaryLabel={t('kitchenIssueTopUp')}
        secondaryLabel={t('kitchenIssueMarkAndNew')}
        primaryPending={issueMutation.isPending}
        onPrimary={() => issueMutation.mutate({ markOldConsumed: false })}
        onSecondary={() => issueMutation.mutate({ markOldConsumed: true })}
      />
    </div>
  )
}

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
