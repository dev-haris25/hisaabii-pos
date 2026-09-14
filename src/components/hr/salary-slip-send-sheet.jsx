'use client'

import { X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'

import { AuthSubmitButton } from '@/components/auth/auth-submit-button'
import {
  CRM_SHEET_BACKDROP_CLASS,
  CRM_SHEET_BODY_CLASS,
  CRM_SHEET_CLOSE_BTN_CLASS,
  CRM_SHEET_FOOTER_CANCEL_CLASS,
  CRM_SHEET_FOOTER_CLASS,
  CRM_SHEET_HEADER_CLASS,
  CRM_SHEET_HEADER_SUBTITLE_CLASS,
  CRM_SHEET_HEADER_TITLE_CLASS,
  CRM_SHEET_PANEL_CLASS,
} from '@/components/crm/crm-sheet-classes'
import { useSendSheetToEmail } from '@/hooks/use-send-sheet-to-email'
import { cn } from '@/lib/utils'

const fieldClass =
  'type-body-md text-hisabi-on-surface placeholder:text-hisabi-outline/70 w-full rounded-lg border border-hisabi-outline-variant bg-hisabi-surface-container-lowest px-hisabi-md py-3 outline-none transition-shadow focus:border-hisabi-primary focus:ring-1 focus:ring-hisabi-primary/15'

/**
 * @param {{
 *   open: boolean
 *   onOpenChange: (open: boolean) => void
 *   voucherNumber: string
 *   employeeName: string
 *   netPay: string
 *   companyName: string
 *   defaultToEmail: string
 *   defaultSubject: string
 *   defaultMessage: string
 *   onSend: (payload: { to: string, cc: string, subject: string, message: string }) => Promise<void>
 * }} props
 */
export function SalarySlipSendSheet({
  open,
  onOpenChange,
  voucherNumber,
  employeeName,
  netPay,
  companyName,
  defaultToEmail,
  defaultSubject,
  defaultMessage,
  onSend,
}) {
  const t = useTranslations('HR')
  const titleId = useId()
  const ccRef = useRef(/** @type {HTMLInputElement | null} */ (null))
  const subjectRef = useRef(/** @type {HTMLInputElement | null} */ (null))
  const messageRef = useRef(/** @type {HTMLTextAreaElement | null} */ (null))
  const [sending, setSending] = useState(false)
  const [toError, setToError] = useState('')
  const { toEmail, setToEmail, canSend } = useSendSheetToEmail(open, defaultToEmail)

  useEffect(() => {
    if (!open) return
    if (ccRef.current) ccRef.current.value = ''
    if (subjectRef.current) subjectRef.current.value = defaultSubject
    if (messageRef.current) messageRef.current.value = defaultMessage
    setToError('')
  }, [open, defaultSubject, defaultMessage])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  async function handleSend() {
    const to = toEmail.trim()
    if (!to) {
      setToError(t('validationRequired'))
      return
    }
    setSending(true)
    const payload = {
      to,
      cc: ccRef.current?.value.trim() ?? '',
      subject: subjectRef.current?.value.trim() ?? '',
      message: messageRef.current?.value.trim() ?? '',
    }
    try {
      await onSend(payload)
      toast.success(t('salarySlipEmailed'), {
        description: payload.to,
        duration: 5000,
      })
      onOpenChange(false)
    } catch {
      // parent shows error toast
    } finally {
      setSending(false)
    }
  }

  const portalEl = typeof document !== 'undefined' ? document.body : null
  if (!open || !portalEl) return null

  return createPortal(
    <div className="fixed inset-0 z-[110] flex justify-end" role="presentation">
      <button
        type="button"
        aria-label={t('closeSheet')}
        className={CRM_SHEET_BACKDROP_CLASS}
        onClick={() => onOpenChange(false)}
      />
      <div className={CRM_SHEET_PANEL_CLASS} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className={CRM_SHEET_HEADER_CLASS}>
          <div className="min-w-0 flex-1 text-start">
            <h2 id={titleId} className={CRM_SHEET_HEADER_TITLE_CLASS}>
              {t('sendSalarySlipSheetTitle')}
            </h2>
            <p className={CRM_SHEET_HEADER_SUBTITLE_CLASS}>{companyName}</p>
          </div>
          <button
            type="button"
            className={CRM_SHEET_CLOSE_BTN_CLASS}
            onClick={() => onOpenChange(false)}
            aria-label={t('closeSheet')}
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className={cn(CRM_SHEET_BODY_CLASS, 'space-y-hisabi-lg')}>
          <div className="border-hisabi-outline-variant/20 bg-hisabi-surface-container-low flex items-center justify-between gap-hisabi-md rounded-xl border p-hisabi-md">
            <div>
              <p className="type-label-sm text-hisabi-on-surface-variant uppercase tracking-wider">
                {t('salarySlipDocumentLabel')}
              </p>
              <p className="type-label-md text-hisabi-on-surface text-lg font-semibold" dir="ltr">
                {voucherNumber}
              </p>
              <p className="type-body-sm text-hisabi-on-surface-variant mt-1">{employeeName}</p>
            </div>
            <div className="text-end">
              <p className="type-label-sm text-hisabi-on-surface-variant uppercase tracking-wider">
                {t('netTotalLabel')}
              </p>
              <p className="type-headline-md text-hisabi-on-surface font-bold leading-none" dir="ltr">
                {netPay}
              </p>
            </div>
          </div>

          <div className="space-y-hisabi-md">
            <div>
              <label className="type-label-md text-hisabi-on-surface mb-hisabi-xs block" htmlFor="slip-send-to">
                {t('sendSheetTo')}
              </label>
              <input
                id="slip-send-to"
                type="email"
                value={toEmail}
                onChange={(e) => {
                  setToEmail(e.target.value)
                  if (toError) setToError('')
                }}
                className={cn(fieldClass, toError && 'border-hisabi-error')}
                dir="ltr"
                placeholder={t('sendSheetToPlaceholder')}
              />
              {toError ? <p className="type-body-sm text-hisabi-error mt-hisabi-xs">{toError}</p> : null}
            </div>
            <div>
              <label className="type-label-md text-hisabi-on-surface mb-hisabi-xs block" htmlFor="slip-send-cc">
                {t('sendSheetCc')}{' '}
                <span className="text-hisabi-on-surface-variant font-normal">{t('sendSheetOptional')}</span>
              </label>
              <input
                ref={ccRef}
                id="slip-send-cc"
                type="email"
                className={fieldClass}
                dir="ltr"
                placeholder={t('sendSheetCcPlaceholder')}
              />
            </div>
            <div>
              <label
                className="type-label-md text-hisabi-on-surface mb-hisabi-xs block"
                htmlFor="slip-send-subject"
              >
                {t('sendSheetSubject')}
              </label>
              <input
                ref={subjectRef}
                id="slip-send-subject"
                type="text"
                defaultValue={defaultSubject}
                className={fieldClass}
                placeholder={t('sendSheetSubjectPlaceholder')}
              />
            </div>
            <div>
              <label
                className="type-label-md text-hisabi-on-surface mb-hisabi-xs block"
                htmlFor="slip-send-message"
              >
                {t('sendSheetMessage')}
              </label>
              <textarea
                ref={messageRef}
                id="slip-send-message"
                rows={6}
                defaultValue={defaultMessage}
                className={cn(fieldClass, 'resize-none')}
                placeholder={t('sendSheetMessagePlaceholder')}
              />
            </div>
          </div>
        </div>

        <div className={CRM_SHEET_FOOTER_CLASS}>
          <button type="button" className={CRM_SHEET_FOOTER_CANCEL_CLASS} onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </button>
          <AuthSubmitButton
            type="button"
            variant="gold"
            pending={sending}
            disabled={!canSend}
            className="min-h-0 min-w-[8rem] py-3"
            onClick={handleSend}
          >
            {t('sendSalarySlipSheetCta')}
          </AuthSubmitButton>
        </div>
      </div>
    </div>,
    portalEl,
  )
}
