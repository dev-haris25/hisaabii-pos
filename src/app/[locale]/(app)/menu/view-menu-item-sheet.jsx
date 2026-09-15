'use client'

import { Info, ListChecks, Pencil, SlidersHorizontal, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useId, useRef, useState } from 'react'

import { AppLoader } from '@/components/app-loader'
import { Link } from '@/i18n/navigation'
import { authGet } from '@/lib/api/auth-client'
import { formatSarAmount } from '@/lib/settings/format-helpers'
import { cn } from '@/lib/utils'

const SHEET_TRANSITION_MS = 300

/**
 * @param {{
 *   open: boolean
 *   onOpenChange: (open: boolean) => void
 *   itemId: string | null
 *   canEdit?: boolean
 * }} props
 */
export function ViewMenuItemSheet({
  open,
  onOpenChange,
  itemId,
  canEdit = false,
}) {
  const t = useTranslations('Menu')
  const locale = useLocale()
  const isAr = locale === 'ar'
  const titleId = useId()
  const panelRef = useRef(/** @type {HTMLDivElement | null} */ (null))
  const [mounted, setMounted] = useState(false)
  const [animateIn, setAnimateIn] = useState(false)

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['menu', 'item', itemId],
    queryFn: async () => {
      const res = await authGet(`/menu/items/${itemId}`)
      return res.item
    },
    enabled: open && Boolean(itemId),
    staleTime: 0,
  })

  const item = data ?? null

  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => {
        setMounted(true)
        requestAnimationFrame(() => setAnimateIn(true))
      })
      return () => cancelAnimationFrame(id)
    }
    const id = requestAnimationFrame(() => setAnimateIn(false))
    return () => cancelAnimationFrame(id)
  }, [open])

  useEffect(() => {
    if (!mounted) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [mounted])

  useEffect(() => {
    if (!open || !animateIn) return
    const id = requestAnimationFrame(() => {
      const el = panelRef.current?.querySelector('[data-sheet-close]')
      if (el instanceof HTMLElement) el.focus()
    })
    return () => cancelAnimationFrame(id)
  }, [open, animateIn])

  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  /** @param {React.TransitionEvent<HTMLDivElement>} e */
  function handleSheetTransitionEnd(e) {
    if (e.propertyName !== 'transform') return
    if (open) return
    setMounted(false)
  }

  useEffect(() => {
    if (open || !mounted) return
    const timer = window.setTimeout(
      () => setMounted(false),
      SHEET_TRANSITION_MS + 80,
    )
    return () => window.clearTimeout(timer)
  }, [open, mounted])

  if (!mounted || !itemId) return null

  const displayName = item
    ? isAr
      ? item.nameAr
      : item.nameEn?.trim() || item.nameAr
    : ''

  const categoryName = item?.category
    ? isAr
      ? item.category.nameAr
      : item.category.nameEn?.trim() || item.category.nameAr
    : '—'

  const vatLabel =
    item?.vatPreset === 'zero'
      ? t('vatZero')
      : item?.vatPreset === 'exempt'
        ? t('vatExempt')
        : t('vatStandard')

  const variantGroups = Array.isArray(item?.variantGroups)
    ? item.variantGroups
    : []
  const customizations = Array.isArray(item?.customizations)
    ? item.customizations
    : []

  const showFooter = Boolean(item) && !isPending && !isError

  return (
    <div className="fixed inset-0 z-[110] flex justify-end" role="presentation">
      <button
        type="button"
        className={cn(
          'absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity ease-out',
          animateIn ? 'opacity-100' : 'opacity-0',
        )}
        style={{ transitionDuration: `${SHEET_TRANSITION_MS}ms` }}
        aria-label={t('viewCloseAria')}
        onClick={() => onOpenChange(false)}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'relative z-10 flex h-full w-full max-w-[min(var(--width-hisabi-overlay-2xl),calc(100vw-1rem))] flex-col overflow-hidden border-s border-hisabi-outline-variant/30 bg-hisabi-surface-container-lowest shadow-2xl transition-transform ease-out md:max-w-[min(var(--width-hisabi-overlay-2xl),calc(100vw-var(--width-hisabi-sidebar)-1rem))]',
          animateIn
            ? 'translate-x-0'
            : 'ltr:translate-x-full rtl:-translate-x-full',
        )}
        style={{ transitionDuration: `${SHEET_TRANSITION_MS}ms` }}
        onTransitionEnd={handleSheetTransitionEnd}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="border-hisabi-outline-variant/20 flex w-full shrink-0 items-start justify-between gap-hisabi-md border-b py-hisabi-xl px-hisabi-md sm:px-hisabi-lg md:px-hisabi-xl">
          <div className="min-w-0 flex-1 text-start">
            <h2 id={titleId} className="type-headline-md text-hisabi-on-surface">
              {t('viewSheetTitle')}
            </h2>
            {displayName ? (
              <p className="type-body-md text-hisabi-on-surface-variant mt-1">
                {displayName}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            data-sheet-close
            onClick={() => onOpenChange(false)}
            className="text-hisabi-outline hover:bg-hisabi-surface-container-low shrink-0 cursor-pointer rounded-full p-2 transition-colors"
            aria-label={t('viewCloseAria')}
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto px-hisabi-md py-hisabi-xl sm:px-hisabi-lg md:px-hisabi-xl [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {isPending ? (
              <div className="flex min-h-[40vh] items-center justify-center py-hisabi-xxl">
                <AppLoader />
                <span className="sr-only">{t('viewLoading')}</span>
              </div>
            ) : isError || !item ? (
              <div className="space-y-hisabi-md text-center">
                <p className="type-body-md text-hisabi-error" role="alert">
                  {t('viewLoadError')}
                </p>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="type-label-md border-hisabi-teal-container text-hisabi-teal hover:bg-hisabi-teal-container/10 rounded-xl border-2 px-hisabi-lg py-2.5 font-semibold transition-colors"
                >
                  {t('retryLoad')}
                </button>
              </div>
            ) : (
              <div className="space-y-hisabi-xxl">
                {typeof item.imageUrl === 'string' && item.imageUrl ? (
                  <div className="flex justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element -- authenticated menu item image */}
                    <img
                      src={item.imageUrl}
                      alt=""
                      className="max-h-48 rounded-xl border border-hisabi-outline-variant/30 object-contain"
                    />
                  </div>
                ) : null}

                <section>
                  <SheetSectionTitle icon={Info}>
                    {t('viewSectionGeneral')}
                  </SheetSectionTitle>
                  <dl className="grid grid-cols-1 gap-hisabi-md sm:grid-cols-2">
                    <ViewField label={t('itemNameEn')} value={item.nameEn?.trim() || '—'} />
                    <ViewField label={t('itemNameAr')} value={item.nameAr || '—'} rtl />
                    <ViewField label={t('categoryLabel')} value={categoryName} />
                    <ViewField
                      label={t('priceLabel')}
                      value={
                        <span dir="ltr" className="inline-block">
                          {formatSarAmount(item.price, locale)}
                        </span>
                      }
                    />
                    <ViewField label={t('vatLabel')} value={vatLabel} />
                    <ViewField
                      label={t('sortOrderLabel')}
                      value={
                        <span dir="ltr" className="inline-block">
                          {typeof item.sortOrder === 'number' ? item.sortOrder : 0}
                        </span>
                      }
                    />
                    <ViewField
                      label={t('activeLabel')}
                      value={
                        <span
                          className={cn(
                            'type-label-sm inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold',
                            item.active
                              ? 'bg-green-100 text-green-700'
                              : 'bg-slate-100 text-slate-600',
                          )}
                        >
                          {item.active ? t('statusActive') : t('statusInactive')}
                        </span>
                      }
                    />
                  </dl>
                </section>

                <section>
                  <SheetSectionTitle icon={SlidersHorizontal}>
                    {t('sectionVariants')}
                  </SheetSectionTitle>
                  {variantGroups.length === 0 ? (
                    <p className="type-body-md text-hisabi-on-surface-variant">
                      {t('noVariantGroups')}
                    </p>
                  ) : (
                    <div className="space-y-hisabi-lg">
                      {variantGroups.map((group) => {
                        const groupName = isAr
                          ? group.nameAr
                          : group.nameEn?.trim() || group.nameAr
                        return (
                          <div
                            key={group.id}
                            className="rounded-xl border border-hisabi-outline-variant/30 bg-hisabi-surface p-hisabi-md"
                          >
                            <p className="type-label-md mb-hisabi-sm font-bold text-hisabi-on-surface">
                              {groupName}
                            </p>
                            <ul className="space-y-hisabi-xs">
                              {(group.options ?? []).map((option) => {
                                const optionName = isAr
                                  ? option.nameAr
                                  : option.nameEn?.trim() || option.nameAr
                                return (
                                  <li
                                    key={option.id}
                                    className="type-body-sm flex flex-wrap items-center justify-between gap-hisabi-sm text-hisabi-on-surface"
                                  >
                                    <span className="min-w-0">
                                      {optionName}
                                      {option.isDefault ? (
                                        <span className="type-label-sm ms-2 rounded-full bg-hisabi-primary-fixed px-2 py-0.5 text-hisabi-on-primary-fixed">
                                          {t('optionDefault')}
                                        </span>
                                      ) : null}
                                    </span>
                                    <span
                                      dir="ltr"
                                      className="shrink-0 font-medium"
                                    >
                                      {formatSarAmount(option.priceChange, locale)}
                                    </span>
                                  </li>
                                )
                              })}
                            </ul>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </section>

                <section>
                  <SheetSectionTitle icon={ListChecks}>
                    {t('sectionCustomizations')}
                  </SheetSectionTitle>
                  {customizations.length === 0 ? (
                    <p className="type-body-md text-hisabi-on-surface-variant">
                      {t('noCustomizations')}
                    </p>
                  ) : (
                    <ul className="space-y-hisabi-sm">
                      {customizations.map((row) => {
                        const name = isAr
                          ? row.nameAr
                          : row.nameEn?.trim() || row.nameAr
                        return (
                          <li
                            key={row.id}
                            className="type-body-sm flex items-center justify-between gap-hisabi-sm rounded-xl border border-hisabi-outline-variant/30 bg-hisabi-surface px-hisabi-md py-hisabi-sm text-hisabi-on-surface"
                          >
                            <span className="min-w-0">{name}</span>
                            <span dir="ltr" className="shrink-0 font-medium">
                              {formatSarAmount(row.priceChange, locale)}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </section>
              </div>
            )}
          </div>

          {showFooter ? (
            <div
              className={cn(
                'flex shrink-0 flex-col-reverse gap-hisabi-md border-t border-slate-100 bg-slate-50 py-hisabi-xl px-hisabi-md sm:px-hisabi-lg md:px-hisabi-xl',
                canEdit && 'min-[425px]:grid min-[425px]:grid-cols-2',
              )}
            >
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="type-label-md border-hisabi-outline text-hisabi-on-surface-variant hover:bg-hisabi-surface-container-low inline-flex min-h-[52px] w-full min-w-0 cursor-pointer items-center justify-center gap-hisabi-sm rounded-xl border-2 px-hisabi-lg font-semibold transition-all active:scale-[0.98]"
              >
                {t('closeSheet')}
              </button>
              {canEdit ? (
                <Link
                  href={`/menu/items/${itemId}/edit`}
                  className="type-label-md inline-flex min-h-[52px] w-full min-w-0 cursor-pointer items-center justify-center gap-hisabi-sm rounded-xl border-none bg-hisabi-gold-muted px-hisabi-lg py-4 font-bold text-hisabi-on-secondary-container shadow-sm transition-all hover:bg-hisabi-gold-muted-hover active:scale-[0.98]"
                >
                  <Pencil className="size-5 shrink-0" aria-hidden />
                  {t('viewEdit')}
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function SheetSectionTitle({ icon: Icon, children }) {
  return (
    <div className="mb-hisabi-lg flex items-center gap-hisabi-sm">
      <Icon
        className="size-5 shrink-0 text-hisabi-primary-container"
        aria-hidden
      />
      <h3 className="type-label-md font-bold uppercase tracking-wider text-hisabi-primary-container">
        {children}
      </h3>
    </div>
  )
}

/** @param {{ label: string, value: React.ReactNode, rtl?: boolean }} props */
function ViewField({ label, value, rtl = false }) {
  return (
    <div>
      <dt className="type-label-md text-hisabi-on-surface-variant">{label}</dt>
      <dd
        className="type-body-md text-hisabi-on-surface mt-0.5 font-medium"
        dir={rtl ? 'rtl' : undefined}
      >
        {value}
      </dd>
    </div>
  )
}
