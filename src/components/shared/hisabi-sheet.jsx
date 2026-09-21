'use client'

import { X } from 'lucide-react'
import { useEffect, useId } from 'react'
import { createPortal } from 'react-dom'

import {
  CRM_SHEET_BACKDROP_CLASS,
  CRM_SHEET_BODY_CLASS,
  CRM_SHEET_CLOSE_BTN_CLASS,
  CRM_SHEET_FOOTER_CLASS,
  CRM_SHEET_HEADER_CLASS,
  CRM_SHEET_HEADER_SUBTITLE_CLASS,
  CRM_SHEET_HEADER_TITLE_CLASS,
  CRM_SHEET_PANEL_CLASS,
} from '@/components/crm/crm-sheet-classes'
import { cn } from '@/lib/utils'

/**
 * Shared Hisabi slide-over sheet (Rule 16).
 * Same chrome as menu / restaurant / HR promote sheets.
 *
 * @param {{
 *   open: boolean
 *   onOpenChange: (open: boolean) => void
 *   title: string
 *   description?: import('react').ReactNode
 *   children?: import('react').ReactNode
 *   footer?: import('react').ReactNode
 *   closeLabel?: string
 *   panelClassName?: string
 * }} props
 */
export function HisabiSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  closeLabel = 'Close',
  panelClassName,
}) {
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  const portalEl = typeof document !== 'undefined' ? document.body : null
  if (!open || !portalEl) return null

  return createPortal(
    <div className="fixed inset-0 z-[110] flex justify-end" role="presentation">
      <button
        type="button"
        aria-label={closeLabel}
        className={CRM_SHEET_BACKDROP_CLASS}
        onClick={() => onOpenChange(false)}
      />
      <div
        className={cn(CRM_SHEET_PANEL_CLASS, panelClassName)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className={CRM_SHEET_HEADER_CLASS}>
          <div className="min-w-0 flex-1 text-start">
            <h2 id={titleId} className={CRM_SHEET_HEADER_TITLE_CLASS}>
              {title}
            </h2>
            {description ? (
              <div className={CRM_SHEET_HEADER_SUBTITLE_CLASS}>{description}</div>
            ) : null}
          </div>
          <button
            type="button"
            data-sheet-close
            className={CRM_SHEET_CLOSE_BTN_CLASS}
            aria-label={closeLabel}
            onClick={() => onOpenChange(false)}
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        {children ? <div className={CRM_SHEET_BODY_CLASS}>{children}</div> : null}

        {footer ? <div className={CRM_SHEET_FOOTER_CLASS}>{footer}</div> : null}
      </div>
    </div>,
    portalEl,
  )
}

export {
  CRM_SHEET_FOOTER_CANCEL_CLASS as HISABI_SHEET_FOOTER_CANCEL_CLASS,
  CRM_SHEET_FOOTER_SAVE_CLASS as HISABI_SHEET_FOOTER_SAVE_CLASS,
} from '@/components/crm/crm-sheet-classes'
