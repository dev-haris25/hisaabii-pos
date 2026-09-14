'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useMemo } from 'react'

import {
  ZATCA_QR_BITMAP_PX,
  ZatcaQrImage,
} from '@/components/invoices/zatca-qr-image'
import { parseMoney } from '@/lib/invoices/invoice-compute-totals'
import { formatOrderNumber } from '@/lib/orders/riyadh-order-date'
import { formatSarAmount } from '@/lib/settings/format-helpers'
import { cn } from '@/lib/utils'

/**
 * Thermal-style receipt preview matching print-bridge layout (checkout modal + invoice detail).
 *
 * @param {{
 *   invoice: {
 *     sellerCompanyNameAr: string
 *     sellerCompanyNameEn?: string | null
 *     sellerVatNumber?: string | null
 *     sellerCrNumber?: string | null
 *     sellerEmail?: string | null
 *     sellerPhone?: string | null
 *     invoiceNumber: string
 *     invoiceDate: string
 *     staffName?: string | null
 *     paymentMethod?: string | null
 *     amountTendered?: string | null
 *     changeGiven?: string | null
 *     subtotal: string
 *     totalVat: string
 *     grandTotal: string
 *     qrCode?: string | null
 *     reasonAr?: string | null
 *     reasonEn?: string | null
 *     referenceInvoiceNumber?: string | null
 *     lines: Array<{
 *       id?: string
 *       nameAr?: string | null
 *       nameEn?: string | null
 *       quantity: number | string
 *       unitPrice: string | number
 *       discount?: string | number | null
 *       lineTotal: string | number
 *     }>
 *   }
 *   logoUrl?: string | null
 *   fallbackStaffName?: string
 *   fallbackSellerName?: string
 *   documentLabel?: string | null
 *   receiptCopy?: 'customer' | 'kitchen'
 *   className?: string
 * }} props
 */
export function PosThermalReceiptPreview({
  invoice,
  logoUrl = null,
  fallbackStaffName = '',
  fallbackSellerName = '',
  documentLabel = null,
  receiptCopy = 'kitchen',
  className,
}) {
  const t = useTranslations('Pos')
  const locale = useLocale()
  const isAr = locale === 'ar'

  const sellerName = useMemo(() => {
    if (isAr) {
      return String(invoice.sellerCompanyNameAr || fallbackSellerName || '')
    }
    return String(
      invoice.sellerCompanyNameEn?.trim() ||
        invoice.sellerCompanyNameAr ||
        fallbackSellerName ||
        '',
    )
  }, [invoice, isAr, fallbackSellerName])

  const dateLabel = useMemo(() => {
    if (!invoice.invoiceDate) return ''
    try {
      return new Date(invoice.invoiceDate).toLocaleString(
        isAr ? 'ar-SA' : 'en-GB',
        { dateStyle: 'medium', timeStyle: 'short' },
      )
    } catch {
      return String(invoice.invoiceDate)
    }
  }, [invoice.invoiceDate, isAr])

  const lines = Array.isArray(invoice.lines) ? invoice.lines : []

  const discountTotal = useMemo(() => {
    let sum = 0
    for (const line of lines) {
      sum += parseMoney(line.discount ?? '0')
    }
    return sum
  }, [lines])

  const cashierLabel =
    typeof invoice.staffName === 'string' && invoice.staffName.trim()
      ? invoice.staffName
      : fallbackStaffName

  const qrPayload =
    typeof invoice.qrCode === 'string' ? invoice.qrCode : null

  const reasonLabel = isAr
    ? invoice.reasonAr
    : invoice.reasonEn?.trim() || invoice.reasonAr

  return (
    <div
      className={cn(
        'mx-auto w-full max-w-[18rem] bg-white px-3 py-4 text-hisabi-on-surface shadow-inner [font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace]',
        className,
      )}
    >
      <div className="space-y-1 text-center">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- authenticated logo URL / object storage
          <img
            src={logoUrl}
            alt=""
            className="mx-auto max-h-16 w-auto max-w-[12rem] object-contain"
          />
        ) : (
          <p className="text-base font-bold leading-tight">{sellerName}</p>
        )}
        {invoice.sellerVatNumber ? (
          <p className="text-[11px] leading-snug" dir="ltr">
            {t('receiptVat')}: {String(invoice.sellerVatNumber)}
          </p>
        ) : null}
        {invoice.sellerCrNumber ? (
          <p className="text-[11px] leading-snug" dir="ltr">
            {t('receiptCr')}: {String(invoice.sellerCrNumber)}
          </p>
        ) : null}
      </div>

      <div
        className="my-2 border-t border-dashed border-neutral-400"
        aria-hidden
      />
      <p className="text-center text-[11px] font-bold leading-snug">
        {receiptCopy === 'customer'
          ? t('receiptCustomerCopy')
          : t('receiptKitchenCopy')}
      </p>
      <div
        className="my-2 border-t border-dashed border-neutral-400"
        aria-hidden
      />

      <div className="space-y-0.5 text-[11px]">
        {documentLabel ? (
          <p className="text-center text-sm font-bold">{documentLabel}</p>
        ) : null}
        <div className="flex justify-between gap-2">
          <span>
            {documentLabel ? t('receiptNote') : t('receiptInvoice')}
          </span>
          <span dir="ltr" className="font-semibold">
            {String(invoice.invoiceNumber ?? '')}
          </span>
        </div>
        {invoice.orderNumber ? (
          <div className="flex justify-between gap-2">
            <span>{t('receiptOrder')}</span>
            <span dir="ltr" className="font-semibold">
              {formatOrderNumber(invoice.orderNumber)}
            </span>
          </div>
        ) : null}
        {invoice.referenceInvoiceNumber ? (
          <div className="flex justify-between gap-2">
            <span>{t('receiptRefInvoice')}</span>
            <span dir="ltr" className="font-semibold">
              {invoice.referenceInvoiceNumber}
            </span>
          </div>
        ) : null}
        {reasonLabel ? (
          <div className="flex justify-between gap-2">
            <span>{t('receiptReason')}</span>
            <span className="max-w-[60%] text-end">{reasonLabel}</span>
          </div>
        ) : null}
        {dateLabel ? (
          <div className="flex justify-between gap-2">
            <span>{t('receiptDate')}</span>
            <span dir="ltr">{dateLabel}</span>
          </div>
        ) : null}
        <div className="flex justify-between gap-2">
          <span>{t('receiptCashier')}</span>
          <span>{cashierLabel || '—'}</span>
        </div>
      </div>

      <div
        className="my-2 border-t border-dashed border-neutral-400"
        aria-hidden
      />

      <ul className="space-y-2 text-[11px]">
        {lines.map((line) => {
          const name = isAr
            ? String(line.nameAr ?? '')
            : String(line.nameEn || line.nameAr || '')
          return (
            <li key={String(line.id ?? `${name}-${line.quantity}`)}>
              <p className="font-semibold leading-snug">{name}</p>
              <div className="flex justify-between gap-2" dir="ltr">
                <span>
                  {String(line.quantity)} × {formatSarAmount(line.unitPrice, locale)}
                </span>
                <span className="font-semibold">
                  {formatSarAmount(line.lineTotal, locale)}
                </span>
              </div>
            </li>
          )
        })}
      </ul>

      <div
        className="my-2 border-t border-dashed border-neutral-400"
        aria-hidden
      />

      <div className="space-y-0.5 text-[11px]">
        <div className="flex justify-between gap-2">
          <span>{t('subtotal')}</span>
          <span dir="ltr">{formatSarAmount(invoice.subtotal, locale)}</span>
        </div>
        {discountTotal > 0 ? (
          <div className="flex justify-between gap-2">
            <span>{t('discount')}</span>
            <span dir="ltr">−{formatSarAmount(discountTotal, locale)}</span>
          </div>
        ) : null}
        <div className="flex justify-between gap-2">
          <span>{t('vat')}</span>
          <span dir="ltr">{formatSarAmount(invoice.totalVat, locale)}</span>
        </div>
        <div className="flex justify-between gap-2 text-sm font-bold">
          <span>{t('grandTotal')}</span>
          <span dir="ltr">{formatSarAmount(invoice.grandTotal, locale)}</span>
        </div>
        {invoice.paymentMethod ? (
          <>
            <div className="flex justify-between gap-2 pt-1">
              <span>{t('receiptPayment')}</span>
              <span>
                {invoice.paymentMethod === 'card'
                  ? t('paymentCard')
                  : t('paymentCash')}
              </span>
            </div>
            {invoice.paymentMethod === 'cash' ? (
              <>
                <div className="flex justify-between gap-2">
                  <span>{t('receiptReceived')}</span>
                  <span dir="ltr">
                    {formatSarAmount(invoice.amountTendered, locale)}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>{t('receiptChange')}</span>
                  <span dir="ltr">
                    {formatSarAmount(invoice.changeGiven, locale)}
                  </span>
                </div>
              </>
            ) : null}
          </>
        ) : null}
      </div>

      <div
        className="my-2 border-t border-dashed border-neutral-400"
        aria-hidden
      />

      <div className="space-y-2 text-center">
        <div className="mx-auto flex justify-center">
          <ZatcaQrImage
            payload={qrPayload}
            size={ZATCA_QR_BITMAP_PX}
            className="size-[min(180px,55vw)] max-w-full"
            fallback={
              <p className="type-body-sm text-hisabi-on-surface-variant px-2">
                {qrPayload?.trim() ? t('qrReady') : t('qrMissing')}
              </p>
            }
          />
        </div>
        <p className="text-[11px]">{t('receiptThankYou')}</p>
        {invoice.sellerPhone?.trim() ? (
          <p className="text-[11px] leading-snug" dir="ltr">
            {invoice.sellerPhone.trim()}
          </p>
        ) : null}
        {invoice.sellerEmail?.trim() ? (
          <p className="text-[11px] leading-snug" dir="ltr">
            {invoice.sellerEmail.trim()}
          </p>
        ) : null}
      </div>
    </div>
  )
}
