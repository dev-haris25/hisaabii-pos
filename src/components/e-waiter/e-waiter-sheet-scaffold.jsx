'use client'

import { X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import { cn } from '@/lib/utils'

/**
 * Viewport-locked bottom sheet for public E-Waiter.
 * Portals into `.e-waiter-shell` so brand CSS variables stay applied
 * (body portal loses --e-waiter-* and the panel goes transparent).
 *
 * @param {{
 *   title: string
 *   onClose: () => void
 *   children: import('react').ReactNode
 *   closeDisabled?: boolean
 *   zClassName?: string
 *   panelClassName?: string
 * }} props
 */
export function EWaiterSheetScaffold({
  title,
  onClose,
  children,
  closeDisabled = false,
  zClassName = 'z-50',
  panelClassName,
}) {
  const t = useTranslations('EWaiter')
  const [portalTarget, setPortalTarget] = useState(
    /** @type {HTMLElement | null} */ (null),
  )

  useEffect(() => {
    const shell = document.querySelector('.e-waiter-shell')
    setPortalTarget(
      shell instanceof HTMLElement ? shell : document.body,
    )
  }, [])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && !closeDisabled) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, closeDisabled])

  if (!portalTarget) return null

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 flex flex-col justify-end',
        zClassName,
      )}
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label={t('closeSheet')}
        disabled={closeDisabled}
        onClick={() => {
          if (!closeDisabled) onClose()
        }}
      />
      <div
        className={cn(
          'e-waiter-sheet e-waiter-sheet-up e-waiter-surface relative z-10 mx-auto flex w-full max-w-lg flex-col rounded-t-3xl bg-[var(--e-waiter-surface,#ffffff)] pt-hisabi-sm text-[var(--e-waiter-text,inherit)] shadow-2xl',
          panelClassName,
        )}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="mb-hisabi-sm flex items-center justify-between px-hisabi-margin-mobile">
          <h2 className="type-headline-sm font-semibold">{title}</h2>
          <button
            type="button"
            disabled={closeDisabled}
            onClick={onClose}
            className="e-waiter-tap e-waiter-chip inline-flex items-center justify-center rounded-full disabled:opacity-50"
            aria-label={t('closeSheet')}
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>,
    portalTarget,
  )
}
