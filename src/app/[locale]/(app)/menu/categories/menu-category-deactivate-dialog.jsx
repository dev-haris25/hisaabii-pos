'use client'

import { X } from 'lucide-react'
import { useId } from 'react'
import { useTranslations } from 'next-intl'

import { AuthSubmitButton } from '@/components/auth/auth-submit-button'

/**
 * Confirm deactivating a category, with optional cascade to active items.
 *
 * @param {{
 *   open: boolean
 *   onOpenChange: (open: boolean) => void
 *   categoryName: string
 *   activeItemCount: number
 *   pending?: boolean
 *   onDeactivateCategoryOnly: () => void
 *   onDeactivateWithItems: () => void
 * }} props
 */
export function MenuCategoryDeactivateDialog({
  open,
  onOpenChange,
  categoryName,
  activeItemCount,
  pending = false,
  onDeactivateCategoryOnly,
  onDeactivateWithItems,
}) {
  const t = useTranslations('Menu')
  const titleId = useId()
  const hasActiveItems = activeItemCount > 0

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[130]" role="presentation">
      <div
        className="pointer-events-none absolute inset-0 bg-hisabi-primary/50 backdrop-blur-sm"
        aria-hidden
      />
      <div
        className="absolute inset-0 flex h-full min-h-0 w-full items-center justify-center bg-hisabi-on-primary-fixed/80 p-hisabi-margin-mobile sm:p-hisabi-margin-desktop"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && !pending) onOpenChange(false)
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="relative w-full max-w-[var(--width-hisabi-overlay-md)] overflow-hidden rounded-xl border border-hisabi-outline-variant/50 bg-hisabi-surface-container-lowest shadow-hisabi-2"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="h-1 w-full shrink-0 bg-hisabi-secondary" aria-hidden />
          <div className="flex items-start justify-between gap-hisabi-md border-b border-hisabi-outline-variant/20 px-hisabi-lg py-hisabi-md">
            <div className="min-w-0">
              <h2
                id={titleId}
                className="type-headline-sm text-hisabi-on-surface font-bold"
              >
                {t('categoryDeactivateTitle')}
              </h2>
              <p className="type-body-sm text-hisabi-on-surface-variant mt-1">
                {hasActiveItems
                  ? t('categoryDeactivateWithItemsBody', {
                      name: categoryName,
                      count: activeItemCount,
                    })
                  : t('categoryDeactivateBody', { name: categoryName })}
              </p>
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={() => onOpenChange(false)}
              className="text-hisabi-outline hover:bg-hisabi-surface-container shrink-0 rounded-full p-2 disabled:opacity-50"
              aria-label={t('close')}
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>

          <div className="space-y-hisabi-md px-hisabi-lg py-hisabi-lg">
            <AuthSubmitButton
              type="button"
              variant="muted"
              pending={pending}
              onClick={onDeactivateCategoryOnly}
            >
              {t('categoryDeactivateOnly')}
            </AuthSubmitButton>
            {hasActiveItems ? (
              <AuthSubmitButton
                type="button"
                variant="destructive"
                pending={pending}
                onClick={onDeactivateWithItems}
              >
                {t('categoryDeactivateWithItems', { count: activeItemCount })}
              </AuthSubmitButton>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
