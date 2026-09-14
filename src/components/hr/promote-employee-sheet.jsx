'use client'

import { useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'

import { AuthSubmitButton } from '@/components/auth/auth-submit-button'
import {
  CRM_SHEET_BACKDROP_CLASS,
  CRM_SHEET_BODY_CLASS,
  CRM_SHEET_CLOSE_BTN_CLASS,
  CRM_SHEET_FOOTER_CANCEL_CLASS,
  CRM_SHEET_FOOTER_CLASS,
  CRM_SHEET_FOOTER_SAVE_CLASS,
  CRM_SHEET_HEADER_CLASS,
  CRM_SHEET_HEADER_SUBTITLE_CLASS,
  CRM_SHEET_HEADER_TITLE_CLASS,
  CRM_SHEET_PANEL_CLASS,
} from '@/components/crm/crm-sheet-classes'
import { RequiredMark } from '@/components/ui/required-mark'
import { authPost } from '@/lib/api/auth-client'
import { toastAuthApiError } from '@/lib/api/toast-auth-api-error'
import { currentPayPeriod } from '@/lib/hr/promotions/current-pay-period'
import { scrollAfterFieldValidation } from '@/lib/ui/scroll-first-invalid-field'
import { cn } from '@/lib/utils'

const fieldClass =
  'type-body-md text-hisabi-on-surface placeholder:text-hisabi-outline/70 w-full rounded-lg border border-hisabi-outline-variant bg-hisabi-surface-container-lowest px-hisabi-md py-3 outline-none transition-shadow focus:border-hisabi-primary focus:ring-1 focus:ring-hisabi-primary/15'

/** @returns {Record<string, string>} */
function emptyForm() {
  return {
    newSalary: '',
    effectiveFrom: currentPayPeriod(),
    notes: '',
  }
}

/**
 * @param {{
 *   open: boolean
 *   onOpenChange: (open: boolean) => void
 *   employeeId: string
 *   employeeName?: string
 *   onSuccess?: () => void
 * }} props
 */
export function PromoteEmployeeSheet({
  open,
  onOpenChange,
  employeeId,
  employeeName,
  onSuccess,
}) {
  const t = useTranslations('HR')
  const titleId = useId()
  const queryClient = useQueryClient()

  const [form, setForm] = useState(emptyForm)
  const [fieldErrors, setFieldErrors] = useState(/** @type {Record<string, string>} */ ({}))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    setForm(emptyForm())
    setFieldErrors({})
  }, [open, employeeId])

  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setFieldErrors((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  function validate() {
    /** @type {Record<string, string>} */
    const next = {}
    if (!form.effectiveFrom.trim()) {
      next.effectiveFrom = t('validationRequired')
    }
    if (!form.newSalary.trim()) {
      next.newSalary = t('validationRequired')
    }
    setFieldErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSave() {
    if (!validate()) {
      scrollAfterFieldValidation()
      return
    }

    setSaving(true)
    try {
      await authPost(`/hr/employees/${employeeId}/promotions`, {
        newSalary: form.newSalary.trim(),
        effectiveFrom: form.effectiveFrom.trim(),
        notes: form.notes.trim() || null,
      })
      toast.success(t('promotionRecorded'))
      void queryClient.invalidateQueries({ queryKey: ['hr-employee', employeeId] })
      void queryClient.invalidateQueries({ queryKey: ['hr-employees'] })
      onSuccess?.()
      onOpenChange(false)
    } catch (err) {
      toastAuthApiError(t, err)
    } finally {
      setSaving(false)
    }
  }

  const portalEl = typeof document !== 'undefined' ? document.body : null
  if (!open || !portalEl) return null

  const subtitle = employeeName
    ? `${employeeName} · ${t('promoteEmployeeSubtitle')}`
    : t('promoteEmployeeSubtitle')

  return createPortal(
    <div className="fixed inset-0 z-[110] flex justify-end" role="presentation">
      <button
        type="button"
        aria-label={t('closeSheet')}
        className={CRM_SHEET_BACKDROP_CLASS}
        onClick={() => onOpenChange(false)}
      />
      <div
        className={CRM_SHEET_PANEL_CLASS}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className={CRM_SHEET_HEADER_CLASS}>
          <div className="min-w-0 flex-1 text-start">
            <h2 id={titleId} className={CRM_SHEET_HEADER_TITLE_CLASS}>
              {t('promoteEmployeeTitle')}
            </h2>
            <p className={CRM_SHEET_HEADER_SUBTITLE_CLASS}>{subtitle}</p>
          </div>
          <button
            type="button"
            className={CRM_SHEET_CLOSE_BTN_CLASS}
            aria-label={t('closeSheet')}
            onClick={() => onOpenChange(false)}
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className={CRM_SHEET_BODY_CLASS}>
          <div className="space-y-hisabi-md">
            <div className="space-y-hisabi-xs">
              <label htmlFor="promote-salary" className="type-label-md text-hisabi-on-surface block">
                {t('fieldNewSalary')}
                <RequiredMark />
              </label>
              <input
                id="promote-salary"
                type="text"
                inputMode="decimal"
                dir="ltr"
                value={form.newSalary}
                onChange={(e) => updateField('newSalary', e.target.value)}
                className={cn(fieldClass, fieldErrors.newSalary && 'border-hisabi-error')}
                placeholder={t('fieldNewSalaryPlaceholder')}
              />
              {fieldErrors.newSalary ? (
                <p className="type-body-sm text-hisabi-error">{fieldErrors.newSalary}</p>
              ) : null}
            </div>

            <div className="space-y-hisabi-xs">
              <label htmlFor="promote-effective" className="type-label-md text-hisabi-on-surface block">
                {t('fieldEffectiveFrom')}
                <RequiredMark />
              </label>
              <input
                id="promote-effective"
                type="month"
                value={form.effectiveFrom}
                onChange={(e) => updateField('effectiveFrom', e.target.value)}
                className={cn(fieldClass, fieldErrors.effectiveFrom && 'border-hisabi-error')}
              />
              <p className="type-body-sm text-hisabi-on-surface-variant">{t('effectiveFromHelp')}</p>
              {fieldErrors.effectiveFrom ? (
                <p className="type-body-sm text-hisabi-error">{fieldErrors.effectiveFrom}</p>
              ) : null}
            </div>

            <div className="space-y-hisabi-xs">
              <label htmlFor="promote-notes" className="type-label-md text-hisabi-on-surface block">
                {t('fieldPromotionNotes')}
              </label>
              <textarea
                id="promote-notes"
                rows={3}
                value={form.notes}
                onChange={(e) => updateField('notes', e.target.value)}
                className={cn(fieldClass, 'resize-none')}
                placeholder={t('fieldPromotionNotesPlaceholder')}
              />
            </div>
          </div>
        </div>

        <div className={CRM_SHEET_FOOTER_CLASS}>
          <button
            type="button"
            className={CRM_SHEET_FOOTER_CANCEL_CLASS}
            onClick={() => onOpenChange(false)}
          >
            {t('cancel')}
          </button>
          <AuthSubmitButton
            type="button"
            pending={saving}
            onClick={() => void handleSave()}
            className={CRM_SHEET_FOOTER_SAVE_CLASS}
          >
            {t('promoteEmployeeSubmit')}
          </AuthSubmitButton>
        </div>
      </div>
    </div>,
    portalEl,
  )
}
