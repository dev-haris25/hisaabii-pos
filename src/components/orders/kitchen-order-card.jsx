'use client'

import { AlertTriangle, Clock, UtensilsCrossed } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { AuthSubmitButton } from '@/components/auth/auth-submit-button'
import { formatLineModifierDetails } from '@/lib/menu/item-modifiers'
import { formatOrderNumber } from '@/lib/orders/riyadh-order-date'
import {
  formatKitchenWait,
  kitchenAgeTone,
  kitchenWaitMs,
} from '@/lib/orders/kitchen-wait-time'
import { cn } from '@/lib/utils'

const AGE_PILL = {
  fresh: 'bg-hisabi-primary-fixed text-hisabi-on-primary-fixed',
  warn: 'bg-hisabi-secondary-fixed text-hisabi-on-secondary-fixed',
  late: 'bg-hisabi-error-container text-hisabi-on-error-container',
}

const AGE_CARD = {
  fresh:
    'border-hisabi-outline-variant/40 bg-hisabi-surface-container-lowest',
  warn: 'border-hisabi-gold bg-hisabi-secondary-fixed/30',
  late: 'border-hisabi-error bg-hisabi-error-container/50',
}

/**
 * @param {{
 *   order: {
 *     invoiceId: string
 *     orderNumber: number
 *     createdAt: string
 *     completedAt?: string | null
 *     lines?: Array<{ nameAr?: string, nameEn?: string | null, quantity?: number }>
 *     updated?: boolean
 *   }
 *   locale: string
 *   nowMs: number
 *   actionLabel?: string | null
 *   actionPending?: boolean
 *   onAction?: () => void
 *   draggable?: boolean
 * }} props
 */
export function KitchenOrderCard({
  order,
  locale,
  nowMs,
  actionLabel = null,
  actionPending = false,
  onAction,
  draggable = false,
}) {
  const t = useTranslations('KitchenQueue')
  const isAr = locale === 'ar'
  const end = order.completedAt ? new Date(order.completedAt).getTime() : nowMs
  const waitMs = kitchenWaitMs(order.createdAt, end)
  const tone = kitchenAgeTone(waitMs)
  const ageLabel =
    tone === 'late' ? t('ageLate') : tone === 'warn' ? t('ageWaiting') : t('ageOnTime')

  return (
    <article
      draggable={draggable}
      onDragStart={
        draggable
          ? (event) => {
              event.dataTransfer.setData('text/invoice-id', order.invoiceId)
              event.dataTransfer.effectAllowed = 'move'
            }
          : undefined
      }
      className={cn(
        'flex flex-col gap-hisabi-sm rounded-hisabi-xl border-2 p-hisabi-md shadow-hisabi-1',
        AGE_CARD[tone],
        draggable && 'cursor-grab active:cursor-grabbing',
      )}
    >
      <div className="flex items-start justify-between gap-hisabi-sm">
        <p className="type-headline-sm font-bold text-hisabi-on-surface" dir="ltr">
          {formatOrderNumber(order.orderNumber)}
        </p>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            className={cn(
              'type-label-sm rounded-hisabi-md px-hisabi-sm py-0.5 font-bold',
              AGE_PILL[tone],
            )}
          >
            {ageLabel}
          </span>
          <p
            className={cn(
              'type-label-sm inline-flex items-center gap-1 font-bold',
              tone === 'late'
                ? 'text-hisabi-error'
                : tone === 'warn'
                  ? 'text-hisabi-gold'
                  : 'text-hisabi-on-surface-variant',
            )}
          >
            <Clock className="size-3.5 shrink-0" aria-hidden />
            <span dir="ltr">{formatKitchenWait(waitMs, t)}</span>
          </p>
        </div>
      </div>

      <ul className="space-y-hisabi-xs">
        {(order.lines ?? []).map((line, idx) => {
          const name = isAr ? line.nameAr : line.nameEn?.trim() || line.nameAr
          return (
            <li
              key={`${order.invoiceId}-${idx}`}
              className="type-body-sm flex items-start gap-hisabi-sm text-hisabi-on-surface-variant"
            >
              <UtensilsCrossed
                className="mt-0.5 size-3.5 shrink-0 text-hisabi-outline"
                aria-hidden
              />
              <span className="min-w-0">
                <span className="block">
                  <span dir="ltr">{line.quantity}</span>
                  {' × '}
                  {name}
                </span>
                {formatLineModifierDetails(
                  line.modifiersSnapshot,
                  line.lineNote,
                  locale,
                  {
                    withGroupNames: true,
                    noteLabel: t('lineNote'),
                  },
                ).map((detail) => (
                  <span
                    key={detail}
                    className="mt-0.5 block text-hisabi-outline"
                  >
                    {detail}
                  </span>
                ))}
              </span>
            </li>
          )
        })}
      </ul>

      {order.updated ? (
        <p className="type-body-sm flex items-start gap-hisabi-sm text-hisabi-gold">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>{t('updatedItemsNote')}</span>
        </p>
      ) : null}

      {actionLabel && onAction ? (
        <AuthSubmitButton
          type="button"
          pending={actionPending}
          onClick={onAction}
          className="mt-hisabi-xs min-h-hisabi-btn-sm"
        >
          {actionLabel}
        </AuthSubmitButton>
      ) : null}
    </article>
  )
}
