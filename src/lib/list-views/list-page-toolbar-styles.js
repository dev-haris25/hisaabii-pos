import { cn } from '@/lib/utils'

/** Status / filter dropdown in the page header (next to primary action). */
export const LIST_PAGE_FILTER_SELECT =
  'type-body-sm min-h-[44px] w-full min-w-[180px] rounded-lg border border-hisabi-outline-variant/40 bg-white px-hisabi-md py-2.5 outline-none transition-shadow focus:border-hisabi-primary focus:ring-1 focus:ring-hisabi-primary/15 sm:w-auto'

/** Extra filter dropdown inside the table toolbar row. */
export const LIST_TABLE_TOOLBAR_SELECT =
  'type-body-sm min-h-[40px] w-full min-w-[160px] rounded-lg border border-hisabi-outline-variant/50 bg-white px-hisabi-md py-2 outline-none transition-shadow focus:border-hisabi-primary focus:ring-1 focus:ring-hisabi-primary/15 sm:w-auto'

export const LIST_TABLE_TOOLBAR_SEARCH =
  'type-body-sm text-hisabi-on-surface placeholder:text-hisabi-outline/60 min-h-[40px] w-full min-w-0 rounded-lg border border-hisabi-outline-variant/50 bg-white px-hisabi-md py-2 outline-none transition-shadow focus:border-hisabi-primary focus:ring-1 focus:ring-hisabi-primary/15 sm:min-w-[290px] sm:max-w-[390px]'

export const LIST_TABLE_TOOLBAR_EXPORT_BUTTON =
  'type-label-sm text-hisabi-on-surface-variant inline-flex w-full shrink-0 cursor-pointer items-center justify-center gap-hisabi-sm whitespace-nowrap rounded-lg border border-transparent px-3 py-2 font-semibold transition-all hover:border-hisabi-outline-variant/30 hover:text-hisabi-primary disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto'

export const LIST_TABLE_TOOLBAR_ROW =
  'flex flex-col gap-hisabi-md border-b border-hisabi-outline-variant/20 bg-slate-50/50 p-hisabi-md sm:flex-row sm:flex-wrap sm:items-center sm:justify-between'

export const LIST_TABLE_TOOLBAR_SUMMARY =
  'type-body-sm min-w-0 flex-1 break-words text-slate-500'

export const LIST_TABLE_TOOLBAR_ACTIONS =
  'flex w-full flex-col gap-hisabi-sm sm:w-auto sm:flex-row sm:items-center'

export const LIST_PAGE_HEADER_ACTIONS =
  'flex flex-col gap-hisabi-sm sm:flex-row sm:items-center sm:gap-hisabi-md'

/**
 * @param {string} [extra]
 */
export function listPageFilterSelectClass(extra) {
  return cn(LIST_PAGE_FILTER_SELECT, extra)
}

/**
 * @param {string} [extra]
 */
export function listTableToolbarSelectClass(extra) {
  return cn(LIST_TABLE_TOOLBAR_SELECT, extra)
}
