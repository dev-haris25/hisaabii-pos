/** Shared slide-over chrome aligned with product view / form sheets. */

export const CRM_SHEET_BACKDROP_CLASS =
  'absolute inset-0 bg-black/40 backdrop-blur-sm'

export const CRM_SHEET_PANEL_CLASS =
  'relative z-10 flex h-full w-full max-w-[min(var(--width-hisabi-overlay-2xl),calc(100vw-1rem))] flex-col overflow-hidden border-s border-hisabi-outline-variant/30 bg-hisabi-surface-container-lowest md:max-w-[min(var(--width-hisabi-overlay-2xl),calc(100vw-var(--width-hisabi-sidebar)-1rem))]'

export const CRM_SHEET_HEADER_CLASS =
  'border-hisabi-outline-variant/20 flex w-full shrink-0 items-start justify-between gap-hisabi-md border-b py-hisabi-xl px-hisabi-md sm:px-hisabi-lg md:px-hisabi-xl'

export const CRM_SHEET_HEADER_TITLE_CLASS = 'type-headline-md text-hisabi-on-surface'

export const CRM_SHEET_HEADER_SUBTITLE_CLASS =
  'type-body-md text-hisabi-on-surface-variant mt-1'

export const CRM_SHEET_CLOSE_BTN_CLASS =
  'text-hisabi-outline hover:bg-hisabi-surface-container-low shrink-0 cursor-pointer rounded-full p-2 transition-colors'

export const CRM_SHEET_BODY_CLASS =
  'min-h-0 flex-1 overflow-y-auto px-hisabi-md py-hisabi-xl sm:px-hisabi-lg md:px-hisabi-xl'

export const CRM_SHEET_FOOTER_CLASS =
  'flex shrink-0 flex-col-reverse gap-hisabi-md border-t border-slate-100 bg-slate-50 py-hisabi-xl px-hisabi-md min-[425px]:grid min-[425px]:grid-cols-2 sm:px-hisabi-lg md:px-hisabi-xl'

export const CRM_SHEET_FOOTER_CANCEL_CLASS =
  'type-label-md border-hisabi-outline text-hisabi-on-surface-variant hover:bg-hisabi-surface-container-low inline-flex min-h-hisabi-btn w-full min-w-0 cursor-pointer items-center justify-center gap-hisabi-sm rounded-xl border-2 px-hisabi-lg font-semibold transition-all active:scale-[0.98]'

export const CRM_SHEET_FOOTER_PRIMARY_CLASS =
  'type-label-md inline-flex min-h-hisabi-btn w-full min-w-0 cursor-pointer items-center justify-center gap-hisabi-sm rounded-xl border-none bg-hisabi-gold-muted px-hisabi-lg py-hisabi-btn font-bold text-hisabi-on-secondary-container shadow-sm transition-all hover:bg-hisabi-gold-muted-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:h-[var(--size-hisabi-icon-md)] [&_svg]:w-[var(--size-hisabi-icon-md)]'

export const CRM_SHEET_FOOTER_SAVE_CLASS = 'min-h-hisabi-btn w-full min-w-0 py-hisabi-btn'
