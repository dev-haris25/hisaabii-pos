'use client'

import { Trash2, X } from 'lucide-react'
import { useTranslations } from 'next-intl'

/**
 * @param {{
 *   selectedCount: number
 *   onDelete: () => void
 *   onClear: () => void
 *   deletePending?: boolean
 * }} props
 */
export function ListBulkActionsBar({
  selectedCount,
  onDelete,
  onClear,
  deletePending = false,
}) {
  const t = useTranslations('ListViews')

  if (selectedCount <= 0) return null

  return (
    <div className="flex flex-wrap items-center justify-between gap-hisabi-md border-b border-hisabi-primary/20 bg-hisabi-primary/5 px-hisabi-lg py-3">
      <span className="type-label-sm font-bold text-hisabi-on-surface">
        {t('selectedCount', { count: selectedCount })}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onDelete}
          disabled={deletePending}
          className="type-label-sm inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-hisabi-error px-3 py-1.5 font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 className="size-4" aria-hidden />
          {t('bulkDelete')}
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={deletePending}
          aria-label={t('clearSelection')}
          className="cursor-pointer rounded-lg border border-transparent p-1.5 text-slate-400 transition-all hover:border-hisabi-outline-variant/30 hover:bg-white hover:text-hisabi-on-surface disabled:cursor-not-allowed disabled:opacity-50"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  )
}
