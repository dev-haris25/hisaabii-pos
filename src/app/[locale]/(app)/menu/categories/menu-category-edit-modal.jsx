'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'

import { AuthSubmitButton } from '@/components/auth/auth-submit-button'
import { RequiredMark } from '@/components/ui/required-mark'
import { useGeminiArSuggestion } from '@/hooks/use-gemini-ar-suggestion'
import { useGeminiEnSuggestion } from '@/hooks/use-gemini-en-suggestion'
import { AuthApiError, authPatch, authPost } from '@/lib/api/auth-client'
import {
  shouldEnableBilingualTranslate,
  useBilingualFieldOrigin,
} from '@/lib/i18n/use-bilingual-field-origin'
import { scrollAfterFieldValidation } from '@/lib/ui/scroll-first-invalid-field'
import { cn } from '@/lib/utils'

const fieldClass =
  'type-body-md text-hisabi-on-surface placeholder:text-hisabi-outline/70 w-full rounded-lg border border-hisabi-outline-variant bg-hisabi-surface px-hisabi-md py-hisabi-sm outline-none transition-shadow focus:border-hisabi-primary focus:ring-2 focus:ring-hisabi-primary/10'

const PAIR_KEY = 'menu.category.modal.name'

/**
 * Shared create/edit category dialog (used from categories page and inline on menu item form).
 *
 * @param {{
 *   open: boolean
 *   onOpenChange: (open: boolean) => void
 *   category?: {
 *     id: string
 *     nameAr: string
 *     nameEn?: string | null
 *   } | null
 *   onSuccess?: (category: {
 *     id: string
 *     nameAr: string
 *     nameEn?: string | null
 *   }) => void
 * }} props
 */
export function MenuCategoryEditModal({
  open,
  onOpenChange,
  category = null,
  onSuccess,
}) {
  const t = useTranslations('Menu')
  const tBi = useTranslations('BilingualInvoiceCompany')
  const tErr = useTranslations('AuthErrors')
  const queryClient = useQueryClient()
  const titleId = useId()
  const bilingualFieldOrigin = useBilingualFieldOrigin()
  const { origin, reportUserInput, markAutoFilled, consumeAutoFillSkip, resetOrigin } =
    bilingualFieldOrigin

  const isEdit = Boolean(category?.id)

  const [nameAr, setNameAr] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({ nameAr: '' })
  const [nameEnBaseline, setNameEnBaseline] = useState('')
  const formScrollRef = useRef(/** @type {HTMLDivElement | null} */ (null))

  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => {
      if (category?.id) {
        setNameAr(category.nameAr ?? '')
        setNameEn(category.nameEn ?? '')
        setNameEnBaseline(category.nameEn ?? '')
      } else {
        setNameAr('')
        setNameEn('')
        setNameEnBaseline('')
      }
      setFormError('')
      setFieldErrors({ nameAr: '' })
      resetOrigin()
    })
    return () => cancelAnimationFrame(id)
  }, [open, category, resetOrigin])

  const { loading: loadingNameAr } = useGeminiArSuggestion(
    nameEn,
    (ar) => {
      markAutoFilled('ar', PAIR_KEY, ar)
      setNameAr(ar.slice(0, 80))
    },
    {
      englishBaseline: isEdit ? nameEnBaseline : undefined,
      enabled: open && shouldEnableBilingualTranslate(origin, 'en', nameAr),
      shouldSkip: (trimmed) => consumeAutoFillSkip(PAIR_KEY, 'en', trimmed),
    },
  )
  const { loading: loadingNameEn } = useGeminiEnSuggestion(
    nameAr,
    (en) => {
      markAutoFilled('en', PAIR_KEY, en)
      setNameEn(en.slice(0, 80))
    },
    {
      enabled: open && shouldEnableBilingualTranslate(origin, 'ar', nameEn),
      shouldSkip: (trimmed) => consumeAutoFillSkip(PAIR_KEY, 'ar', trimmed),
    },
  )

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        nameAr: nameAr.trim(),
        nameEn: nameEn.trim() || null,
      }
      if (isEdit && category?.id) {
        return authPatch(`/menu/categories/${category.id}`, body)
      }
      return authPost('/menu/categories', body)
    },
    onSuccess: (data) => {
      toast.success(isEdit ? t('categoryUpdated') : t('categoryAdded'))
      queryClient.invalidateQueries({ queryKey: ['menu', 'categories'] })
      queryClient.invalidateQueries({ queryKey: ['menu', 'items'] })
      const saved = data?.category
      if (saved?.id && onSuccess) {
        onSuccess({
          id: String(saved.id),
          nameAr: String(saved.nameAr ?? ''),
          nameEn:
            typeof saved.nameEn === 'string' ? saved.nameEn : null,
        })
      }
      onOpenChange(false)
    },
    onError: (err) => {
      const code = err instanceof AuthApiError ? err.code : undefined
      setFormError(code ? tErr(code) : tErr('generic'))
    },
  })

  if (!open) return null
  if (isEdit && !category) return null

  const canSave = !saveMutation.isPending

  return (
    <div className="fixed inset-0 z-[130]" role="presentation">
      <div
        className="pointer-events-none absolute inset-0 bg-hisabi-primary/50 backdrop-blur-sm"
        aria-hidden
      />
      <div
        className="absolute inset-0 flex h-full min-h-0 w-full items-center justify-center bg-hisabi-on-primary-fixed/80 p-hisabi-margin-mobile sm:p-hisabi-margin-desktop"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && !saveMutation.isPending) {
            onOpenChange(false)
          }
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="relative flex max-h-[min(32rem,85vh)] w-full max-w-[var(--width-hisabi-overlay-xl)] flex-col overflow-hidden rounded-xl border border-hisabi-outline-variant/50 bg-hisabi-surface-container-lowest shadow-hisabi-2"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="h-1 w-full shrink-0 bg-hisabi-primary-container" aria-hidden />
          <div className="flex items-start justify-between gap-hisabi-md border-b border-hisabi-outline-variant/20 px-hisabi-lg py-hisabi-md">
            <div className="min-w-0">
              <h2
                id={titleId}
                className="type-headline-sm text-hisabi-on-surface font-bold"
              >
                {isEdit ? t('categoryEditTitle') : t('categoryAddTitle')}
              </h2>
              <p className="type-body-sm text-hisabi-on-surface-variant mt-1">
                {isEdit ? t('categoryEditSubtitle') : t('categoryAddSubtitle')}
              </p>
            </div>
            <button
              type="button"
              disabled={saveMutation.isPending}
              onClick={() => onOpenChange(false)}
              className="text-hisabi-outline hover:bg-hisabi-surface-container shrink-0 rounded-full p-2 disabled:opacity-50"
              aria-label={t('close')}
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>

          <div
            ref={formScrollRef}
            className="min-h-0 flex-1 space-y-hisabi-md overflow-y-auto px-hisabi-lg py-hisabi-md"
          >
            {formError ? (
              <p className="type-body-sm text-hisabi-error" role="alert">
                {formError}
              </p>
            ) : null}
            <div
              dir="ltr"
              className="grid grid-cols-1 gap-hisabi-md sm:grid-cols-2"
            >
              <div className="min-w-0 space-y-hisabi-xs text-start">
                <label
                  className="type-label-md text-hisabi-on-surface-variant flex items-center gap-2"
                  htmlFor="cat-modal-en"
                >
                  {t('categoryNameEn')}
                  {loadingNameEn ? (
                    <Loader2
                      className="text-hisabi-teal size-4 shrink-0 animate-spin"
                      aria-label={tBi('translating')}
                    />
                  ) : null}
                </label>
                <input
                  id="cat-modal-en"
                  value={nameEn}
                  onChange={(e) => {
                    const next = e.target.value.slice(0, 80)
                    reportUserInput('en', PAIR_KEY, {
                      otherFieldEmpty: !nameAr.trim(),
                    })
                    setNameEn(next)
                  }}
                  placeholder={t('categoryNameEnPlaceholder')}
                  className={fieldClass}
                  dir="ltr"
                />
              </div>
              <div className="min-w-0 space-y-hisabi-xs text-start">
                <label
                  className="type-label-md text-hisabi-on-surface-variant flex items-center gap-2"
                  htmlFor="cat-modal-ar"
                >
                  {t('categoryNameAr')}
                  <RequiredMark />
                  {loadingNameAr ? (
                    <Loader2
                      className="text-hisabi-teal size-4 shrink-0 animate-spin"
                      aria-label={tBi('translating')}
                    />
                  ) : null}
                </label>
                <input
                  id="cat-modal-ar"
                  value={nameAr}
                  onChange={(e) => {
                    const next = e.target.value.slice(0, 80)
                    reportUserInput('ar', PAIR_KEY, {
                      otherFieldEmpty: !nameEn.trim(),
                    })
                    setNameAr(next)
                    setFieldErrors((prev) =>
                      prev.nameAr ? { ...prev, nameAr: '' } : prev,
                    )
                  }}
                  placeholder={t('categoryNameArPlaceholder')}
                  className={cn(
                    fieldClass,
                    fieldErrors.nameAr &&
                      'border-hisabi-error focus:border-hisabi-error focus:ring-hisabi-error/25',
                  )}
                  dir="rtl"
                  aria-invalid={fieldErrors.nameAr ? true : undefined}
                  aria-describedby={
                    fieldErrors.nameAr ? 'cat-modal-ar-error' : undefined
                  }
                />
                {fieldErrors.nameAr ? (
                  <p
                    id="cat-modal-ar-error"
                    className="type-body-sm text-hisabi-error"
                    role="alert"
                  >
                    {fieldErrors.nameAr}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-hisabi-sm border-t border-hisabi-outline-variant/20 px-hisabi-lg py-hisabi-md sm:flex-row sm:justify-end">
            <button
              type="button"
              disabled={saveMutation.isPending}
              onClick={() => onOpenChange(false)}
              className="type-label-md text-hisabi-primary hover:bg-hisabi-surface-container-low inline-flex min-h-[48px] cursor-pointer items-center justify-center rounded-lg border border-hisabi-primary/20 px-hisabi-lg font-semibold transition-all disabled:opacity-50"
            >
              {t('cancel')}
            </button>
            <AuthSubmitButton
              type="button"
              variant="gold"
              pending={saveMutation.isPending}
              disabled={!canSave}
              className="min-h-[48px] w-full sm:w-auto sm:min-w-[10rem]"
              onClick={() => {
                setFormError('')
                if (!nameAr.trim()) {
                  setFieldErrors({ nameAr: t('validationNameAr') })
                  scrollAfterFieldValidation(formScrollRef.current)
                  return
                }
                setFieldErrors({ nameAr: '' })
                saveMutation.mutate()
              }}
            >
              {isEdit ? t('save') : t('addCategory')}
            </AuthSubmitButton>
          </div>
        </div>
      </div>
    </div>
  )
}
