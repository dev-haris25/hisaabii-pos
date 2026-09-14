import { cn } from '@/lib/utils'

/** Horizontal scroll container for list tables. */
export const LIST_TABLE_SCROLL_WRAP =
  'overflow-x-auto [container-type:inline-size]'

/** Base table layout — use with inline `minWidth` style or min-w-[…] class. */
export const LIST_TABLE_BASE =
  'w-full border-separate border-spacing-0 text-start'

export const LIST_TABLE_HEAD_ROW =
  'border-b border-hisabi-outline-variant/20 bg-slate-50/80'

export const LIST_TABLE_BODY = 'divide-y divide-hisabi-outline-variant/10'

export const LIST_TABLE_ROW =
  'group/row transition-colors hover:bg-slate-50'

export const LIST_TABLE_TH =
  'type-label-sm text-hisabi-on-surface-variant whitespace-nowrap px-hisabi-lg py-4 text-start uppercase tracking-wider'

export const LIST_TABLE_TH_STICKY =
  'sticky start-0 z-20 border-e border-hisabi-outline-variant/10 bg-slate-50'

export const LIST_TABLE_TH_CHECKBOX = 'w-10 px-3 py-4'

export const LIST_TABLE_TD =
  'whitespace-nowrap px-hisabi-lg py-4'

export const LIST_TABLE_TD_STICKY =
  'sticky start-0 z-10 border-e border-hisabi-outline-variant/10 bg-white transition-colors group-hover/row:bg-slate-50'

export const LIST_TABLE_TD_CHECKBOX = 'px-3 py-4'

/** Actions column — keep icon buttons on a single row. */
export const LIST_TABLE_ACTIONS_TD = 'whitespace-nowrap px-hisabi-lg py-4 w-px'

export const LIST_TABLE_ACTIONS_INNER =
  'flex w-max max-w-none shrink-0 flex-nowrap items-center justify-start gap-0.5'

/** Client tab / portal tables (slightly compact padding). */
export const CLIENT_TAB_TABLE_BASE =
  'w-full border-separate border-spacing-0 text-start'

export const CLIENT_TAB_HEAD_ROW =
  'border-b border-hisabi-outline-variant/30 bg-hisabi-surface-container-low/50'

export const CLIENT_TAB_TH =
  'type-label-sm text-hisabi-on-surface-variant whitespace-nowrap px-hisabi-lg py-hisabi-md text-start font-semibold'

export const CLIENT_TAB_TH_STICKY =
  'sticky start-0 z-20 border-e border-hisabi-outline-variant/10 bg-hisabi-surface-container-low'

export const CLIENT_TAB_TD =
  'whitespace-nowrap px-hisabi-lg py-hisabi-md'

export const CLIENT_TAB_TD_STICKY =
  'sticky start-0 z-10 border-e border-hisabi-outline-variant/10 bg-white transition-colors group-hover/row:bg-hisabi-surface-container-low/50'

export const CLIENT_TAB_ROW =
  'group/row transition-colors hover:bg-hisabi-surface-container-low'

export const CLIENT_TAB_ACTIONS_TD = 'whitespace-nowrap px-hisabi-lg py-hisabi-md w-px'

export const CLIENT_TAB_ACTIONS_INNER =
  'flex w-max max-w-none shrink-0 flex-nowrap items-center justify-start gap-0.5'

/**
 * @param {string} [extra]
 */
export function listTableActionsTdClass(extra) {
  return cn(LIST_TABLE_ACTIONS_TD, extra)
}

/**
 * @param {string} [extra]
 */
export function clientTabActionsTdClass(extra) {
  return cn(CLIENT_TAB_ACTIONS_TD, extra)
}

/**
 * @param {string} [extra]
 * @param {boolean} [sticky]
 */
export function listTableThClass(extra, sticky = false) {
  return cn(LIST_TABLE_TH, sticky && LIST_TABLE_TH_STICKY, extra)
}

/**
 * @param {string} [extra]
 * @param {boolean} [sticky]
 */
export function listTableTdClass(extra, sticky = false) {
  return cn(LIST_TABLE_TD, sticky && LIST_TABLE_TD_STICKY, extra)
}

/**
 * @param {string} [extra]
 * @param {boolean} [sticky]
 */
export function clientTabThClass(extra, sticky = false) {
  return cn(CLIENT_TAB_TH, sticky && CLIENT_TAB_TH_STICKY, extra)
}

/**
 * @param {string} [extra]
 * @param {boolean} [sticky]
 */
export function clientTabTdClass(extra, sticky = false) {
  return cn(CLIENT_TAB_TD, sticky && CLIENT_TAB_TD_STICKY, extra)
}
