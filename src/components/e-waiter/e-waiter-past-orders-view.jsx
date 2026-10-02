'use client'

import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ImageIcon, RotateCcw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect } from 'react'

import { formatSarAmount } from '@/lib/settings/format-helpers'
import { cn } from '@/lib/utils'

/**
 * Full-screen past orders: invoice cards with items, images, totals, reorder.
 *
 * @param {{
 *   themeId: string
 *   locale: 'ar' | 'en'
 *   slug: string
 *   qrToken: string
 *   loyaltyAccountId: string
 *   orderingLocked?: boolean
 *   onBack: () => void
 *   onReorderOrder: (order: {
 *     lines: Array<{
 *       menuItemId: string | null
 *       quantity: number
 *       optionIds: string[]
 *       customizationIds: string[]
 *       reorderable: boolean
 *     }>
 *   }) => void
 *   onLoyaltyBalance?: (balance: string) => void
 *   loyaltyBadgeLabel?: string
 * }} props
 */
export function EWaiterPastOrdersView({
  themeId,
  locale,
  slug,
  qrToken,
  loyaltyAccountId,
  orderingLocked = false,
  onBack,
  onReorderOrder,
  onLoyaltyBalance,
  loyaltyBadgeLabel,
}) {
  const t = useTranslations('EWaiter')

  const query = useQuery({
    queryKey: ['e-waiter-past-orders', slug, qrToken, loyaltyAccountId],
    queryFn: async () => {
      const url = new URL(
        `/api/public/order/${encodeURIComponent(slug)}/${encodeURIComponent(qrToken)}/past-orders`,
        window.location.origin,
      )
      url.searchParams.set('loyaltyAccountId', loyaltyAccountId)
      const res = await fetch(url.pathname + url.search, { credentials: 'omit' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.ok === false) {
        throw new Error(String(data.code ?? 'FETCH_FAILED'))
      }
      return {
        loyaltyBalance: String(data.loyaltyBalance ?? '0'),
        orders: /** @type {Array<Record<string, unknown>>} */ (
          data.orders ?? []
        ),
      }
    },
  })

  useEffect(() => {
    if (query.data?.loyaltyBalance != null) {
      onLoyaltyBalance?.(String(query.data.loyaltyBalance))
    }
  }, [query.data?.loyaltyBalance, onLoyaltyBalance])

  const orders = query.data?.orders ?? []

  /**
   * @param {string} iso
   */
  function formatOrderDate(iso) {
    try {
      return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA' : 'en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(iso))
    } catch {
      return String(iso)
    }
  }

  return (
    <div
      className="e-waiter-shell e-waiter-fade-in flex min-h-dvh flex-col"
      data-ew={themeId}
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
    >
      <header className="e-waiter-surface sticky top-0 z-20 border-b e-waiter-border px-hisabi-margin-mobile py-hisabi-md shadow-sm">
        <div className="e-waiter-content-narrow flex items-center gap-hisabi-sm">
          <button
            type="button"
            onClick={onBack}
            className="e-waiter-tap e-waiter-chip inline-flex shrink-0 items-center justify-center rounded-full"
            aria-label={t('backToMenu')}
          >
            <ArrowLeft
              className={cn('size-5', locale === 'ar' && 'rotate-180')}
              aria-hidden
            />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="type-headline-sm font-semibold">
              {t('pastOrdersTitle')}
            </h1>
            <p className="type-body-sm e-waiter-text-muted">
              {t('pastOrdersScreenHint')}
            </p>
          </div>
        </div>
      </header>

      <main className="e-waiter-content-narrow mx-auto flex w-full flex-1 flex-col gap-hisabi-md px-hisabi-margin-mobile py-hisabi-md pb-[calc(var(--spacing-hisabi-xxl)+var(--e-waiter-safe-bottom))]">
        {query.isLoading ? (
          <p className="type-body-md e-waiter-text-muted py-hisabi-xl text-center">
            {t('pastOrdersLoading')}
          </p>
        ) : query.isError ? (
          <p className="type-body-md text-hisabi-error py-hisabi-xl text-center">
            {t('pastOrdersFailed')}
          </p>
        ) : orders.length === 0 ? (
          <p className="type-body-md e-waiter-text-muted py-hisabi-xl text-center">
            {t('pastOrdersEmpty')}
          </p>
        ) : (
          <ul className="flex flex-col gap-hisabi-lg">
            {orders.map((order) => {
              const lines = /** @type {Array<Record<string, unknown>>} */ (
                order.lines ?? []
              )
              const canReorder =
                order.reorderable === true &&
                !orderingLocked &&
                lines.some((l) => l.reorderable === true)

              return (
                <li
                  key={String(order.id)}
                  className="e-waiter-surface space-y-hisabi-md rounded-xl border e-waiter-border p-hisabi-md shadow-sm"
                >
                  <div className="flex items-start justify-between gap-hisabi-md">
                    <div className="min-w-0">
                      <p className="type-label-md font-semibold">
                        {t('pastOrderInvoice', {
                          number: String(order.invoiceNumber ?? ''),
                        })}
                      </p>
                      <p className="type-body-sm e-waiter-text-muted">
                        {formatOrderDate(String(order.createdAt ?? ''))}
                      </p>
                    </div>
                  </div>

                  <ul className="flex flex-col gap-hisabi-sm">
                    {lines.map((line) => {
                      const name =
                        locale === 'ar'
                          ? String(line.nameAr ?? '')
                          : String(line.nameEn ?? '').trim() ||
                            String(line.nameAr ?? '')
                      const mods = /** @type {string[]} */ (
                        locale === 'ar'
                          ? line.modifierNamesAr ?? []
                          : line.modifierNamesEn ?? []
                      )
                      const imageUrl =
                        typeof line.imageUrl === 'string' ? line.imageUrl : null

                      return (
                        <li
                          key={String(line.id)}
                          className="flex items-start gap-hisabi-md"
                        >
                          {imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element -- public menu item
                            <img
                              src={imageUrl}
                              alt=""
                              className="e-waiter-thumb shrink-0 rounded-lg object-cover"
                            />
                          ) : (
                            <div
                              className="e-waiter-thumb e-waiter-chip flex shrink-0 items-center justify-center rounded-lg"
                              aria-hidden
                            >
                              <ImageIcon className="size-5 opacity-50" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="type-label-md font-semibold">
                              {name}
                            </p>
                            {typeof line.calories === 'number' ? (
                              <p className="type-body-sm e-waiter-text-muted">
                                {t('calories', { count: line.calories })}
                              </p>
                            ) : null}
                            {mods.length > 0 ? (
                              <p className="type-body-sm e-waiter-text-muted">
                                {mods.join(' · ')}
                              </p>
                            ) : null}
                            <p className="type-body-sm e-waiter-text-muted">
                              ×{String(line.quantity)} ·{' '}
                              {formatSarAmount(
                                String(line.lineTotal ?? '0'),
                                locale,
                              )}
                            </p>
                          </div>
                        </li>
                      )
                    })}
                  </ul>

                  <div className="space-y-hisabi-xs border-t e-waiter-border pt-hisabi-md">
                    {order.discount != null &&
                    typeof order.discount === 'object' ? (
                      <>
                        <div className="flex items-center justify-between gap-hisabi-md">
                          <p className="type-body-sm e-waiter-text-muted">
                            {t('pastOrderSubtotal')}
                          </p>
                          <p className="type-body-sm tabular-nums">
                            {formatSarAmount(
                              String(order.itemsSubtotal ?? '0'),
                              locale,
                            )}
                          </p>
                        </div>
                        <div className="flex items-center justify-between gap-hisabi-md">
                          <p className="type-body-sm e-waiter-text-muted">
                            {(() => {
                              const d = /** @type {Record<string, unknown>} */ (
                                order.discount
                              )
                              if (d.type === 'loyalty') {
                                return t('pastOrderDiscountLoyalty', {
                                  points: String(d.points ?? '0'),
                                })
                              }
                              if (d.type === 'coupon') {
                                return t('pastOrderDiscountCoupon', {
                                  code: String(d.couponCode ?? ''),
                                })
                              }
                              return t('pastOrderDiscountManual')
                            })()}
                          </p>
                          <p className="type-body-sm tabular-nums">
                            −
                            {formatSarAmount(
                              String(
                                /** @type {Record<string, unknown>} */ (
                                  order.discount
                                ).amount ?? '0',
                              ),
                              locale,
                            )}
                          </p>
                        </div>
                      </>
                    ) : null}
                    <div className="flex items-center justify-between gap-hisabi-md">
                      <p className="type-label-md font-semibold">
                        {t('pastOrderTotal')}
                      </p>
                      <p className="type-label-md font-bold tabular-nums">
                        {formatSarAmount(
                          String(order.grandTotal ?? '0'),
                          locale,
                        )}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={!canReorder}
                    onClick={() => {
                      if (!canReorder) return
                      onReorderOrder({
                        lines: lines.map((l) => ({
                          menuItemId:
                            l.menuItemId != null ? String(l.menuItemId) : null,
                          quantity: Math.max(1, Number(l.quantity) || 1),
                          optionIds: Array.isArray(l.optionIds)
                            ? l.optionIds.map(String)
                            : [],
                          customizationIds: Array.isArray(l.customizationIds)
                            ? l.customizationIds.map(String)
                            : [],
                          reorderable: l.reorderable === true,
                        })),
                      })
                    }}
                    className="e-waiter-btn-primary type-label-md flex min-h-[var(--e-waiter-tap)] w-full items-center justify-center gap-hisabi-xs rounded-xl font-bold disabled:opacity-40"
                  >
                    <RotateCcw className="size-4 shrink-0" aria-hidden />
                    {t('pastOrderReorder')}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </main>

      {loyaltyBadgeLabel ? (
        <div
          className="pointer-events-none fixed end-hisabi-margin-mobile z-30 bottom-[calc(var(--spacing-hisabi-lg)+var(--e-waiter-safe-bottom))]"
          role="status"
          aria-label={loyaltyBadgeLabel}
        >
          <div className="e-waiter-surface pointer-events-auto rounded-xl border e-waiter-border px-hisabi-md py-hisabi-sm shadow-sm">
            <p className="type-label-md font-bold tabular-nums">
              {loyaltyBadgeLabel}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
