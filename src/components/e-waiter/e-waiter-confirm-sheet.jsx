'use client'

import { EWaiterSheetScaffold } from '@/components/e-waiter/e-waiter-sheet-scaffold'

/**
 * Lightweight confirm / cancel bottom sheet for public E-Waiter.
 *
 * @param {{
 *   title: string
 *   body: string
 *   confirmLabel: string
 *   cancelLabel: string
 *   pending?: boolean
 *   onClose: () => void
 *   onConfirm: () => void
 * }} props
 */
export function EWaiterConfirmSheet({
  title,
  body,
  confirmLabel,
  cancelLabel,
  pending = false,
  onClose,
  onConfirm,
}) {
  return (
    <EWaiterSheetScaffold
      title={title}
      onClose={onClose}
      closeDisabled={pending}
    >
      <div className="space-y-hisabi-md px-hisabi-margin-mobile pb-hisabi-md">
        <p className="type-body-md e-waiter-text-muted">{body}</p>
        <button
          type="button"
          disabled={pending}
          onClick={onConfirm}
          className="type-label-md flex min-h-[var(--e-waiter-tap)] w-full items-center justify-center rounded-2xl border border-hisabi-error/40 font-bold text-hisabi-error disabled:opacity-50"
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onClose}
          className="e-waiter-btn-primary type-label-md flex min-h-[var(--e-waiter-tap)] w-full items-center justify-center rounded-2xl font-bold disabled:opacity-50"
        >
          {cancelLabel}
        </button>
      </div>
    </EWaiterSheetScaffold>
  )
}
