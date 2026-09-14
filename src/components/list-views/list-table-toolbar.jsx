'use client'

import { Download } from 'lucide-react'

import {
  LIST_TABLE_TOOLBAR_ACTIONS,
  LIST_TABLE_TOOLBAR_EXPORT_BUTTON,
  LIST_TABLE_TOOLBAR_ROW,
  LIST_TABLE_TOOLBAR_SEARCH,
  LIST_TABLE_TOOLBAR_SUMMARY,
} from '@/lib/list-views/list-page-toolbar-styles'
import { cn } from '@/lib/utils'

/**
 * Table toolbar row — showing count, search, optional extra controls, export CSV.
 * Matches Hisabi invoice/products list layout.
 *
 * @param {{
 *   summary: import('react').ReactNode
 *   searchValue?: string
 *   onSearchChange?: (value: string) => void
 *   searchPlaceholder?: string
 *   exportLabel?: string
 *   onExport?: () => void
 *   exportDisabled?: boolean
 *   children?: import('react').ReactNode
 *   className?: string
 * }} props
 */
export function ListTableToolbar({
  summary,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  exportLabel,
  onExport,
  exportDisabled = false,
  children,
  className,
}) {
  const showSearch =
    searchPlaceholder != null && onSearchChange != null && searchValue != null

  const hasSummary = summary != null && summary !== ''

  return (
    <div
      className={cn(
        LIST_TABLE_TOOLBAR_ROW,
        !hasSummary && 'sm:justify-end',
        className,
      )}
    >
      {hasSummary ? (
        <p className={LIST_TABLE_TOOLBAR_SUMMARY}>{summary}</p>
      ) : null}
      <div className={LIST_TABLE_TOOLBAR_ACTIONS}>
        {showSearch ? (
          <input
            type="search"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className={LIST_TABLE_TOOLBAR_SEARCH}
          />
        ) : null}
        {children}
        {onExport && exportLabel ? (
          <button
            type="button"
            disabled={exportDisabled}
            onClick={onExport}
            className={LIST_TABLE_TOOLBAR_EXPORT_BUTTON}
          >
            <Download className="size-4 shrink-0" aria-hidden />
            {exportLabel}
          </button>
        ) : null}
      </div>
    </div>
  )
}
