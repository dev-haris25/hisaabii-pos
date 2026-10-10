'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Minus, Plus, Receipt, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import { HisabiSpinner } from '@/components/hisabi-spinner'
import { AuthLocaleToggle } from '@/components/auth/auth-locale-toggle'
import { EWaiterConfirmSheet } from '@/components/e-waiter/e-waiter-confirm-sheet'
import { EWaiterSheetScaffold } from '@/components/e-waiter/e-waiter-sheet-scaffold'
import { EWaiterOfferPrice } from '@/components/e-waiter/e-waiter-offer-price'
import {
  OFFER_REFRESH_CODES,
  expectedOfferDiscountForLines,
  lineInclusiveAmounts,
  offerDisplayName,
  optionNamesFor,
} from '@/components/e-waiter/e-waiter-offer-utils'
import {
  computeUnitPriceFromItem,
  defaultVariantSelection,
  menuItemHasCustomizations,
  menuItemHasVariantGroups,
  optionIdsFromSelection,
} from '@/lib/menu/item-modifiers'
import {
  resolveLineDisplayCalories,
  resolveOptionDisplayCalories,
  selectedVariantOptionsFromItem,
} from '@/lib/menu/resolve-display-calories'
import { vatInclusiveLineTotal } from '@/lib/e-waiter/vat-inclusive-price'
import { decimalStringFromNumber } from '@/lib/invoices/invoice-compute-totals'
import { formatSarAmount } from '@/lib/settings/format-helpers'
import { cn } from '@/lib/utils'

const POLL_MS = 4000
/** @type {Array<Record<string, unknown>>} */
const NO_OFFERS = []

/**
 * @param {unknown} item
 * @param {'ar' | 'en'} locale
 */
function itemName(item, locale) {
  if (locale === 'ar') return String(item?.nameAr ?? '')
  return String(item?.nameEn ?? '').trim() || String(item?.nameAr ?? '')
}

/**
 * @param {unknown} row
 * @param {'ar' | 'en'} locale
 */
function bilingualName(row, locale) {
  if (locale === 'ar') return String(row?.nameAr ?? '')
  return String(row?.nameEn ?? '').trim() || String(row?.nameAr ?? '')
}

/**
 * VAT-inclusive amounts of a round line, before and after the offer discount
 * locked when the round was placed.
 *
 * @param {Record<string, unknown>} line
 */
function roundLineAmounts(line) {
  return lineInclusiveAmounts({
    quantity: Number(line.quantity) || 0,
    unitPrice: computeUnitPriceFromItem(
      line,
      /** @type {string[]} */ (line.variantOptionIds ?? []),
      /** @type {string[]} */ (line.customizationIds ?? []),
    ),
    vatPreset: String(line.vatPreset ?? 'standard'),
    discount: line.offerId ? String(line.offerDiscount ?? '0') : '0',
  })
}

/**
 * @param {Record<string, unknown>} round
 * @returns {string}
 */
function roundInclusiveTotal(round) {
  const lines = /** @type {Array<Record<string, unknown>>} */ (
    round?.lines ?? []
  )
  let sum = 0
  for (const line of lines) {
    sum += roundLineAmounts(line).netIncl
  }
  return decimalStringFromNumber(sum)
}

/**
 * Round lines in display order: normal lines, and deal components grouped
 * by `offerGroupKey` (one block per deal box set).
 *
 * @param {Array<Record<string, unknown>>} lines
 * @returns {Array<{ type: 'line', line: Record<string, unknown> } | { type: 'deal', key: string, offerId: string, lines: Array<Record<string, unknown>> }>}
 */
function groupRoundLines(lines) {
  /** @type {Array<any>} */
  const entries = []
  /** @type {Map<string, any>} */
  const deals = new Map()
  for (const line of lines) {
    const key = line.offerGroupKey ? String(line.offerGroupKey) : ''
    if (!key) {
      entries.push({ type: 'line', line })
      continue
    }
    let deal = deals.get(key)
    if (!deal) {
      deal = { type: 'deal', key, offerId: String(line.offerId ?? ''), lines: [] }
      deals.set(key, deal)
      entries.push(deal)
    }
    deal.lines.push(line)
  }
  return entries
}

/**
 * @param {Record<string, unknown>} line
 */
function isDealLine(line) {
  return Boolean(line.offerGroupKey)
}

/**
 * Session rounds manager: every non-cancelled round with its own status;
 * edit/remove/cancel only while that round is still pending.
 *
 * @param {{
 *   themeId: string
 *   locale: 'ar' | 'en'
 *   slug: string
 *   qrToken: string
 *   kitchenOrderId: string
 *   onBackToMenu: () => void
 *   onSessionEnded?: () => void
 *   billRequested?: boolean
 *   canAskForBill?: boolean
 *   waiterCalled?: boolean
 *   actionPending?: boolean
 *   askBillPending?: boolean
 *   onAskForBill?: () => void
 *   onCallWaiter?: () => void
 *   parentActionMessage?: string
 *   offers?: Array<Record<string, unknown>>
 *   redeemBlockedNote?: string
 * }} props
 */
export function EWaiterRoundView({
  themeId,
  locale,
  slug,
  qrToken,
  kitchenOrderId: _kitchenOrderId,
  onBackToMenu,
  onSessionEnded,
  billRequested = false,
  canAskForBill = false,
  waiterCalled = false,
  actionPending: parentActionPending = false,
  askBillPending = false,
  onAskForBill,
  onCallWaiter,
  parentActionMessage = '',
  offers = NO_OFFERS,
  redeemBlockedNote = '',
}) {
  const t = useTranslations('EWaiter')
  const tErr = useTranslations('AuthErrors')
  const router = useRouter()
  const queryClient = useQueryClient()
  const [actionError, setActionError] = useState('')
  const [actionPending, setActionPending] = useState(false)
  const [editTarget, setEditTarget] = useState(
    /** @type {{ kitchenOrderId: string, line: Record<string, unknown> } | null} */ (
      null
    ),
  )
  const [confirmTarget, setConfirmTarget] = useState(
    /** @type {null | { kind: 'cancel-round', kitchenOrderId: string } | { kind: 'remove-line', kitchenOrderId: string, lineId: string }} */ (
      null
    ),
  )

  const queryKey = ['e-waiter-rounds', slug, qrToken]

  const roundsQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await fetch(
        `/api/public/order/${encodeURIComponent(slug)}/${encodeURIComponent(qrToken)}/rounds`,
        { credentials: 'omit' },
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.ok === false) {
        const err = new Error(String(data.code ?? 'FETCH_FAILED'))
        Object.assign(err, { code: data.code })
        throw err
      }
      return /** @type {Array<Record<string, unknown>>} */ (data.rounds ?? [])
    },
    refetchInterval: (query) => {
      const rounds = query.state.data ?? []
      if (rounds.length === 0) return false
      const allTerminal = rounds.every(
        (r) => r.status === 'completed' || r.status === 'cancelled',
      )
      if (allTerminal) return false
      return POLL_MS
    },
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  })

  const rounds = roundsQuery.data ?? []

  useEffect(() => {
    if (roundsQuery.isError) {
      const code =
        roundsQuery.error &&
        typeof roundsQuery.error === 'object' &&
        'code' in roundsQuery.error
          ? String(roundsQuery.error.code)
          : ''
      if (code === 'NOT_FOUND') setActionError(t('roundNotFound'))
    }
  }, [roundsQuery.isError, roundsQuery.error, t])

  const grandTotalInclusive = useMemo(() => {
    let sum = 0
    for (const round of rounds) {
      sum += Number(roundInclusiveTotal(round))
    }
    return sum.toFixed(2)
  }, [rounds])

  const anyPendingEditable = rounds.some(
    (r) => r.editable === true && r.status === 'pending' && !billRequested,
  )

  /**
   * @param {string} kitchenOrderId
   * @param {Array<Record<string, unknown>>} nextLines
   */
  async function patchLines(kitchenOrderId, nextLines) {
    // Deal lines are kept by the server — never resend them.
    const normalLines = nextLines.filter((line) => !isDealLine(line))
    const expectedOfferDiscount = expectedOfferDiscountForLines(
      normalLines,
      offers,
    )
    setActionPending(true)
    setActionError('')
    try {
      const res = await fetch(
        `/api/public/order/${encodeURIComponent(slug)}/${encodeURIComponent(qrToken)}/rounds/${encodeURIComponent(kitchenOrderId)}`,
        {
          method: 'PATCH',
          credentials: 'omit',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lines: normalLines.map((line) => ({
              menuItemId: line.menuItemId,
              quantity: Number(line.quantity) || 1,
              variantOptionIds: line.variantOptionIds ?? line.optionIds ?? [],
              customizationIds: line.customizationIds ?? [],
              lineNote: line.lineNote ?? null,
            })),
            ...(expectedOfferDiscount ? { expectedOfferDiscount } : {}),
          }),
        },
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.ok === false) {
        const code = typeof data.code === 'string' ? data.code : ''
        if (code === 'ROUND_NOT_EDITABLE') {
          setActionError(t('roundLocked'))
        } else if (code === 'INVALID_MENU_ITEM') {
          setActionError(t('orderInvalidItems'))
        } else if (OFFER_REFRESH_CODES.has(code)) {
          // Offers changed since the menu loaded → fresh offers, then retry.
          setActionError(tErr(code))
          router.refresh()
        } else if (code.startsWith('OFFER')) {
          setActionError(tErr(code))
        } else {
          setActionError(t('roundEditFailed'))
        }
        await roundsQuery.refetch()
        return
      }
      if (data.sessionClosed) onSessionEnded?.()
      await roundsQuery.refetch()
      if (data.cancelled) {
        queryClient.invalidateQueries({ queryKey })
      }
    } catch {
      setActionError(t('roundEditFailed'))
    } finally {
      setActionPending(false)
    }
  }

  /**
   * @param {string} kitchenOrderId
   */
  async function cancelRound(kitchenOrderId) {
    setActionPending(true)
    setActionError('')
    try {
      const res = await fetch(
        `/api/public/order/${encodeURIComponent(slug)}/${encodeURIComponent(qrToken)}/rounds/${encodeURIComponent(kitchenOrderId)}`,
        { method: 'DELETE', credentials: 'omit' },
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.ok === false) {
        const code = typeof data.code === 'string' ? data.code : ''
        setActionError(
          code === 'ROUND_NOT_EDITABLE'
            ? t('roundLocked')
            : t('roundEditFailed'),
        )
        await roundsQuery.refetch()
        return
      }
      await roundsQuery.refetch()
      if (data.sessionClosed) onSessionEnded?.()
    } catch {
      setActionError(t('roundEditFailed'))
    } finally {
      setActionPending(false)
    }
  }

  /**
   * @param {Record<string, unknown>} round
   * @param {string} lineId
   * @param {number} delta
   */
  function bumpLineQty(round, lineId, delta) {
    const editable =
      round.editable === true &&
      round.status === 'pending' &&
      !billRequested
    if (!editable || actionPending) return
    const lines = /** @type {Array<Record<string, unknown>>} */ (
      round.lines ?? []
    )
    const next = lines
      .map((line) => {
        if (line.id !== lineId) return line
        return {
          ...line,
          quantity: Math.max(0, Number(line.quantity) + delta),
        }
      })
      .filter((line) => Number(line.quantity) > 0)
    void patchLines(String(round.kitchenOrderId), next)
  }

  /**
   * @param {Record<string, unknown>} round
   * @param {string} lineId
   */
  function removeLine(round, lineId) {
    const editable =
      round.editable === true &&
      round.status === 'pending' &&
      !billRequested
    if (!editable || actionPending) return
    const lines = /** @type {Array<Record<string, unknown>>} */ (
      round.lines ?? []
    )
    void patchLines(
      String(round.kitchenOrderId),
      lines.filter((line) => line.id !== lineId),
    )
  }

  return (
    <div
      className="e-waiter-shell e-waiter-fade-in flex min-h-dvh flex-col"
      data-ew={themeId}
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
    >
      <header className="e-waiter-surface sticky top-0 z-20 border-b e-waiter-border px-hisabi-margin-mobile py-hisabi-md shadow-sm">
        <div className="e-waiter-content-narrow flex items-start gap-hisabi-sm">
          <div className="min-w-0 flex-1">
            <h1 className="type-headline-sm font-semibold">
              {t('roundManageTitle')}
            </h1>
            <p className="type-body-sm e-waiter-text-muted">
              {t('roundsSessionHint', { count: rounds.length })}
            </p>
          </div>
          <AuthLocaleToggle />
        </div>
      </header>

      <main className="e-waiter-content-narrow mx-auto flex w-full flex-1 flex-col gap-hisabi-md px-hisabi-margin-mobile py-hisabi-md">
        {roundsQuery.isLoading && rounds.length === 0 ? (
          <p className="type-body-md e-waiter-text-muted py-hisabi-xl text-center">
            {t('roundLoading')}
          </p>
        ) : rounds.length === 0 ? (
          <div className="space-y-hisabi-lg py-hisabi-xl text-center">
            <p className="type-body-md e-waiter-text-muted">
              {t('roundsEmpty')}
            </p>
            <button
              type="button"
              onClick={onBackToMenu}
              className="e-waiter-btn-primary type-label-md mx-auto flex min-h-[var(--e-waiter-tap)] w-full items-center justify-center rounded-2xl font-bold"
            >
              {t('orderAgain')}
            </button>
          </div>
        ) : (
          <>
            <ul className="flex flex-col gap-hisabi-lg">
              {rounds.map((round) => {
                const editable =
                  round.editable === true &&
                  round.status === 'pending' &&
                  !billRequested
                const lines = /** @type {Array<Record<string, unknown>>} */ (
                  round.lines ?? []
                )
                const roundTotal = roundInclusiveTotal(round)
                return (
                  <li
                    key={String(round.kitchenOrderId)}
                    className="e-waiter-surface space-y-hisabi-md rounded-xl border e-waiter-border p-hisabi-md shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-hisabi-md">
                      <div className="min-w-0">
                        <p className="type-label-md font-semibold">
                          {t('roundSectionTitle', {
                            round: String(round.roundNumber ?? ''),
                            number: String(round.orderNumber ?? ''),
                          })}
                        </p>
                        {editable ? (
                          <p className="type-body-sm e-waiter-text-muted mt-0.5">
                            {t('roundEditableHint')}
                          </p>
                        ) : round.status === 'pending' && billRequested ? (
                          <p className="type-body-sm e-waiter-text-muted mt-0.5">
                            {t('billRequestedHint')}
                          </p>
                        ) : round.status === 'preparing' ? (
                          <p className="type-body-sm e-waiter-text-muted mt-0.5">
                            {t('roundBeingPrepared')}
                          </p>
                        ) : null}
                      </div>
                      <StatusPill status={String(round.status ?? 'pending')} t={t} />
                    </div>

                    <ul className="flex flex-col gap-hisabi-md">
                      {groupRoundLines(lines).map((entry) => {
                        if (entry.type === 'deal') {
                          return (
                            <RoundDealBlock
                              key={entry.key}
                              entry={entry}
                              offers={offers}
                              locale={locale}
                              editable={editable}
                            />
                          )
                        }
                        const line = entry.line
                        const amounts = roundLineAmounts(line)
                        return (
                          <li
                            key={String(line.id)}
                            className="flex gap-hisabi-md rounded-xl border e-waiter-border p-hisabi-md"
                          >
                            <div className="min-w-0 flex-1 space-y-hisabi-xs">
                              <p className="type-label-md font-semibold">
                                {itemName(line, locale)}
                              </p>
                              {typeof line.calories === 'number' ? (
                                <p className="type-body-sm e-waiter-text-muted">
                                  {t('calories', { count: line.calories })}
                                </p>
                              ) : null}
                              <EWaiterOfferPrice
                                original={amounts.grossIncl}
                                discounted={
                                  line.offerId ? amounts.netIncl : null
                                }
                                locale={locale}
                              />
                              {editable ? (
                                <div className="flex flex-wrap gap-hisabi-sm pt-hisabi-xs">
                                  <button
                                    type="button"
                                    disabled={actionPending}
                                    className="type-label-sm e-waiter-chip rounded-full px-hisabi-md py-2 font-semibold disabled:opacity-50"
                                    onClick={() =>
                                      setEditTarget({
                                        kitchenOrderId: String(
                                          round.kitchenOrderId,
                                        ),
                                        line,
                                      })
                                    }
                                  >
                                    {t('editItem')}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={actionPending}
                                    className="type-label-sm inline-flex items-center gap-1 rounded-full px-hisabi-md py-2 font-semibold text-hisabi-error disabled:opacity-50"
                                    onClick={() =>
                                      setConfirmTarget({
                                        kind: 'remove-line',
                                        kitchenOrderId: String(
                                          round.kitchenOrderId,
                                        ),
                                        lineId: String(line.id),
                                      })
                                    }
                                  >
                                    <Trash2 className="size-3.5" aria-hidden />
                                    {t('removeItem')}
                                  </button>
                                </div>
                              ) : null}
                            </div>
                            {editable ? (
                              <div className="flex flex-col items-center gap-hisabi-xs">
                                <button
                                  type="button"
                                  disabled={actionPending}
                                  className="e-waiter-tap e-waiter-btn-primary inline-flex items-center justify-center rounded-full disabled:opacity-50"
                                  aria-label={t('increaseQty')}
                                  onClick={() =>
                                    bumpLineQty(round, String(line.id), 1)
                                  }
                                >
                                  <Plus className="size-4" aria-hidden />
                                </button>
                                <span className="type-label-md font-bold">
                                  {String(line.quantity)}
                                </span>
                                <button
                                  type="button"
                                  disabled={actionPending}
                                  className="e-waiter-tap e-waiter-chip inline-flex items-center justify-center rounded-full disabled:opacity-50"
                                  aria-label={t('decreaseQty')}
                                  onClick={() =>
                                    bumpLineQty(round, String(line.id), -1)
                                  }
                                >
                                  <Minus className="size-4" aria-hidden />
                                </button>
                              </div>
                            ) : (
                              <span className="type-label-md self-center font-bold">
                                ×{String(line.quantity)}
                              </span>
                            )}
                          </li>
                        )
                      })}
                    </ul>

                    <div className="flex items-center justify-between border-t e-waiter-border pt-hisabi-sm">
                      <span className="type-label-sm e-waiter-text-muted font-semibold">
                        {t('roundSubtotal')}
                      </span>
                      <span className="type-label-md e-waiter-primary-text font-bold">
                        {formatSarAmount(roundTotal, locale)}
                      </span>
                    </div>

                    {editable ? (
                      <button
                        type="button"
                        disabled={actionPending}
                        onClick={() =>
                          setConfirmTarget({
                            kind: 'cancel-round',
                            kitchenOrderId: String(round.kitchenOrderId),
                          })
                        }
                        className="type-label-md flex min-h-[var(--e-waiter-tap)] w-full items-center justify-center rounded-2xl border border-hisabi-error/40 font-semibold text-hisabi-error disabled:opacity-50"
                      >
                        {t('cancelRound')}
                      </button>
                    ) : null}
                  </li>
                )
              })}
            </ul>

            <div className="mt-auto space-y-hisabi-sm border-t e-waiter-border pt-hisabi-md">
              <div className="flex gap-hisabi-sm">
                <button
                  type="button"
                  disabled={actionPending || parentActionPending}
                  onClick={onCallWaiter}
                  className="type-label-sm e-waiter-chip flex min-h-[var(--e-waiter-tap)] flex-1 items-center justify-center gap-hisabi-xs rounded-xl font-semibold disabled:opacity-50"
                >
                  <Bell className="size-4 shrink-0" aria-hidden />
                  {waiterCalled ? t('waiterCalled') : t('callWaiter')}
                </button>
                {canAskForBill || billRequested ? (
                  <button
                    type="button"
                    disabled={
                      actionPending ||
                      parentActionPending ||
                      askBillPending ||
                      billRequested
                    }
                    onClick={onAskForBill}
                    aria-busy={askBillPending || undefined}
                    className={cn(
                      'type-label-sm flex min-h-[var(--e-waiter-tap)] flex-1 items-center justify-center gap-hisabi-xs rounded-xl font-semibold disabled:opacity-50',
                      billRequested
                        ? 'e-waiter-chip-active'
                        : 'e-waiter-btn-primary',
                    )}
                  >
                    {askBillPending ? (
                      <HisabiSpinner size="inline" />
                    ) : (
                      <Receipt className="size-4 shrink-0" aria-hidden />
                    )}
                    {billRequested
                      ? t('billRequested')
                      : askBillPending
                        ? t('askBillPending')
                        : t('askForBill')}
                  </button>
                ) : null}
              </div>
              {billRequested ? (
                <p className="type-body-sm e-waiter-text-muted text-center">
                  {t('billRequestedHint')}
                </p>
              ) : null}
              {redeemBlockedNote ? (
                <p className="type-body-sm e-waiter-text-muted text-center">
                  {redeemBlockedNote}
                </p>
              ) : null}
              {parentActionMessage && !billRequested ? (
                <p className="type-body-sm e-waiter-text-muted text-center" role="status">
                  {parentActionMessage}
                </p>
              ) : null}
              <div className="flex items-center justify-between">
                <span className="type-label-md font-semibold">
                  {t('cartTotal')}
                </span>
                <span className="type-headline-sm e-waiter-primary-text font-bold">
                  {formatSarAmount(grandTotalInclusive, locale)}
                </span>
              </div>
              {actionError ? (
                <p
                  className="type-body-sm text-center text-hisabi-error"
                  role="alert"
                >
                  {actionError}
                </p>
              ) : null}
              <button
                type="button"
                onClick={onBackToMenu}
                className="e-waiter-btn-primary type-label-md flex min-h-[var(--e-waiter-tap)] w-full items-center justify-center rounded-2xl font-bold"
              >
                {anyPendingEditable ? t('orderMore') : t('orderAgain')}
              </button>
            </div>
          </>
        )}
      </main>

      {editTarget &&
      rounds.some(
        (r) =>
          String(r.kitchenOrderId) === editTarget.kitchenOrderId &&
          r.editable === true &&
          r.status === 'pending' &&
          !billRequested,
      ) ? (
        <RoundLineEditSheet
          locale={locale}
          line={editTarget.line}
          pending={actionPending}
          onClose={() => setEditTarget(null)}
          onSave={(optionIds, customizationIds, quantity) => {
            const round = rounds.find(
              (r) => String(r.kitchenOrderId) === editTarget.kitchenOrderId,
            )
            if (!round?.lines) return
            const lines = /** @type {Array<Record<string, unknown>>} */ (
              round.lines
            )
            const next = lines.map((line) => {
              if (line.id !== editTarget.line.id) return line
              return {
                ...line,
                quantity,
                variantOptionIds: optionIds,
                customizationIds,
              }
            })
            setEditTarget(null)
            void patchLines(editTarget.kitchenOrderId, next)
          }}
        />
      ) : null}

      {confirmTarget ? (
        <EWaiterConfirmSheet
          title={
            confirmTarget.kind === 'cancel-round'
              ? t('cancelRoundTitle')
              : t('removeItemTitle')
          }
          body={
            confirmTarget.kind === 'cancel-round'
              ? t('cancelRoundBody')
              : t('removeItemBody')
          }
          confirmLabel={
            confirmTarget.kind === 'cancel-round'
              ? t('cancelRoundConfirm')
              : t('removeItemConfirm')
          }
          cancelLabel={
            confirmTarget.kind === 'cancel-round'
              ? t('cancelRoundKeep')
              : t('removeItemKeep')
          }
          pending={actionPending}
          onClose={() => {
            if (!actionPending) setConfirmTarget(null)
          }}
          onConfirm={() => {
            if (actionPending) return
            const target = confirmTarget
            setConfirmTarget(null)
            if (target.kind === 'cancel-round') {
              void cancelRound(target.kitchenOrderId)
              return
            }
            const round = rounds.find(
              (r) => String(r.kitchenOrderId) === target.kitchenOrderId,
            )
            if (round) removeLine(round, target.lineId)
          }}
        />
      ) : null}
    </div>
  )
}

/**
 * One deal in a round: read-only (cancel the round to drop it), shows the
 * VAT-inclusive price locked when the round was placed.
 *
 * @param {{
 *   entry: { key: string, offerId: string, lines: Array<Record<string, unknown>> }
 *   offers: Array<Record<string, unknown>>
 *   locale: 'ar' | 'en'
 *   editable: boolean
 * }} props
 */
function RoundDealBlock({ entry, offers, locale, editable }) {
  const t = useTranslations('EWaiter')
  const first = entry.lines[0]
  const offer =
    offers.find((o) => String(o.id) === entry.offerId) ??
    (first?.offerNameAr || first?.offerNameEn
      ? { nameAr: first.offerNameAr, nameEn: first.offerNameEn }
      : null)
  let gross = 0
  let net = 0
  for (const line of entry.lines) {
    const amounts = roundLineAmounts(line)
    gross += amounts.grossIncl
    net += amounts.netIncl
  }
  return (
    <li className="space-y-hisabi-xs rounded-xl border e-waiter-border p-hisabi-md">
      <p className="type-label-md flex flex-wrap items-center gap-hisabi-xs font-semibold">
        <span className="type-label-sm e-waiter-btn-accent inline-flex rounded-full px-hisabi-sm font-semibold">
          {t('offers.dealBadge')}
        </span>
        <span className="min-w-0">
          {offer ? offerDisplayName(offer, locale) : t('offers.dealGeneric')}
        </span>
      </p>
      <ul className="type-body-sm e-waiter-text-muted space-y-0.5">
        {entry.lines.map((line) => {
          const opts = optionNamesFor(
            line,
            /** @type {string[]} */ (line.variantOptionIds ?? []),
            locale,
          )
          return (
            <li key={String(line.id)}>
              {t('offers.componentQty', {
                qty: Number(line.quantity) || 1,
                name: itemName(line, locale),
              })}
              {opts.length > 0 ? ` · ${opts.join(' · ')}` : ''}
            </li>
          )
        })}
      </ul>
      <EWaiterOfferPrice
        original={decimalStringFromNumber(gross)}
        discounted={decimalStringFromNumber(net)}
        locale={locale}
      />
      {editable ? (
        <p className="type-body-sm e-waiter-text-muted">
          {t('offers.dealLocked')}
        </p>
      ) : null}
    </li>
  )
}

/**
 * @param {{ status: string, t: (key: string) => string }} props
 */
function StatusPill({ status, t }) {
  const label =
    status === 'pending'
      ? t('statusPending')
      : status === 'preparing'
        ? t('statusPreparing')
        : status === 'ready'
          ? t('statusReady')
          : status === 'completed'
            ? t('statusCompleted')
            : status === 'cancelled'
              ? t('statusCancelled')
              : t('statusPreparing')
  return (
    <span
      className={cn(
        'type-label-sm shrink-0 rounded-full px-hisabi-md py-1 font-semibold',
        status === 'pending' ? 'e-waiter-chip' : 'e-waiter-chip-active',
      )}
    >
      {label}
    </span>
  )
}

/**
 * @param {{
 *   locale: 'ar' | 'en'
 *   line: Record<string, unknown>
 *   pending: boolean
 *   onClose: () => void
 *   onSave: (optionIds: string[], customizationIds: string[], quantity: number) => void
 * }} props
 */
function RoundLineEditSheet({ locale, line, pending, onClose, onSave }) {
  const t = useTranslations('EWaiter')
  const initialSelection = useMemo(() => {
    /** @type {Record<string, string>} */
    const sel = {}
    const optionIds = /** @type {string[]} */ (line.variantOptionIds ?? [])
    for (const group of /** @type {Array<Record<string, unknown>>} */ (
      line.variantGroups ?? []
    )) {
      const match = (/** @type {Array<Record<string, unknown>>} */ (
        group.options ?? []
      )).find((o) => optionIds.includes(String(o.id)))
      if (match) sel[String(group.id)] = String(match.id)
      else {
        const fallback = defaultVariantSelection({
          variantGroups: [group],
        })
        Object.assign(sel, fallback)
      }
    }
    return Object.keys(sel).length ? sel : defaultVariantSelection(line)
  }, [line])

  const [selection, setSelection] = useState(initialSelection)
  const [customIds, setCustomIds] = useState(
    /** @type {string[]} */ (
      Array.isArray(line.customizationIds)
        ? line.customizationIds.map(String)
        : []
    ),
  )
  const [qty, setQty] = useState(Math.max(1, Number(line.quantity) || 1))

  const optionIds = optionIdsFromSelection(selection)
  const lineInc = vatInclusiveLineTotal({
    quantity: qty,
    unitPrice: computeUnitPriceFromItem(line, optionIds, customIds),
    vatPreset: String(line.vatPreset ?? 'standard'),
  })
  const itemCaloriesDefault =
    typeof line.itemCalories === 'number' ? line.itemCalories : null
  const displayCalories = resolveLineDisplayCalories(
    itemCaloriesDefault,
    selectedVariantOptionsFromItem(line, optionIds),
  )

  const groups = /** @type {Array<Record<string, unknown>>} */ (
    line.variantGroups ?? []
  )
  const customs = /** @type {Array<Record<string, unknown>>} */ (
    line.customizations ?? []
  )
  const allGroupsPicked = groups.every((g) => Boolean(selection[String(g.id)]))
  const needsConfig =
    menuItemHasVariantGroups(line) || menuItemHasCustomizations(line)

  return (
    <EWaiterSheetScaffold
      title={itemName(line, locale)}
      onClose={onClose}
      closeDisabled={pending}
    >
      <div className="space-y-hisabi-lg overflow-y-auto px-hisabi-margin-mobile">
        {displayCalories != null ? (
          <p className="type-body-sm e-waiter-text-muted">
            {t('calories', { count: displayCalories })}
          </p>
        ) : null}
        {groups.map((group) => (
          <fieldset key={String(group.id)} className="space-y-hisabi-sm">
            <legend className="type-label-md font-semibold">
              {bilingualName(group, locale)}
            </legend>
            <div className="flex flex-col gap-hisabi-xs">
              {(/** @type {Array<Record<string, unknown>>} */ (
                group.options ?? []
              )).map((opt) => {
                const selected = selection[String(group.id)] === opt.id
                const optCalories = resolveOptionDisplayCalories(
                  opt.calories,
                  itemCaloriesDefault,
                )
                return (
                  <button
                    key={String(opt.id)}
                    type="button"
                    onClick={() =>
                      setSelection((prev) => ({
                        ...prev,
                        [String(group.id)]: String(opt.id),
                      }))
                    }
                    className={cn(
                      'flex min-h-[var(--e-waiter-tap)] items-center rounded-xl border px-hisabi-md text-start',
                      selected
                        ? 'e-waiter-chip-active border-transparent'
                        : 'e-waiter-border e-waiter-surface',
                    )}
                  >
                    <span className="min-w-0">
                      <span className="type-body-md block">
                        {bilingualName(opt, locale)}
                      </span>
                      {optCalories != null ? (
                        <span className="type-body-sm block opacity-80">
                          {t('calories', { count: optCalories })}
                        </span>
                      ) : null}
                    </span>
                  </button>
                )
              })}
            </div>
          </fieldset>
        ))}

        {customs.length > 0 ? (
          <fieldset className="space-y-hisabi-sm">
            <legend className="type-label-md font-semibold">
              {t('extras')}
            </legend>
            <div className="flex flex-col gap-hisabi-xs">
              {customs.map((c) => {
                const on = customIds.includes(String(c.id))
                return (
                  <button
                    key={String(c.id)}
                    type="button"
                    onClick={() => {
                      setCustomIds((prev) => {
                        const id = String(c.id)
                        return prev.includes(id)
                          ? prev.filter((x) => x !== id)
                          : [...prev, id]
                      })
                    }}
                    className={cn(
                      'flex min-h-[var(--e-waiter-tap)] items-center rounded-xl border px-hisabi-md text-start',
                      on
                        ? 'e-waiter-chip-active border-transparent'
                        : 'e-waiter-border e-waiter-surface',
                    )}
                  >
                    <span className="type-body-md">
                      {bilingualName(c, locale)}
                    </span>
                  </button>
                )
              })}
            </div>
          </fieldset>
        ) : null}

        <div className="flex items-center justify-between gap-hisabi-md">
          <p className="type-label-md font-semibold">{t('quantity')}</p>
          <div className="flex items-center gap-hisabi-sm">
            <button
              type="button"
              className="e-waiter-tap e-waiter-chip inline-flex items-center justify-center rounded-full"
              aria-label={t('decreaseQty')}
              onClick={() => setQty((q) => Math.max(1, q - 1))}
            >
              <Minus className="size-4" aria-hidden />
            </button>
            <span className="type-label-md min-w-8 text-center font-bold">
              {qty}
            </span>
            <button
              type="button"
              className="e-waiter-tap e-waiter-btn-primary inline-flex items-center justify-center rounded-full"
              aria-label={t('increaseQty')}
              onClick={() => setQty((q) => q + 1)}
            >
              <Plus className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      </div>

      <div className="mt-hisabi-md border-t e-waiter-border px-hisabi-margin-mobile pt-hisabi-md">
        <button
          type="button"
          disabled={pending || (needsConfig && !allGroupsPicked)}
          onClick={() => onSave(optionIds, customIds, qty)}
          className="e-waiter-btn-primary type-label-md flex min-h-[var(--e-waiter-tap)] w-full items-center justify-between rounded-2xl px-hisabi-lg font-bold disabled:opacity-40"
        >
          <span>{t('saveItem')}</span>
          <span>{formatSarAmount(lineInc, locale)}</span>
        </button>
      </div>
    </EWaiterSheetScaffold>
  )
}
