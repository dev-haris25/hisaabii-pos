'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronDown,
  ChevronLeft,
  CloudUpload,
  Loader2,
  Package,
  Save,
  Tags,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'

import { MenuCategoryEditModal } from '../categories/menu-category-edit-modal'
import { AppLoader } from '@/components/app-loader'
import { AuthSubmitButton } from '@/components/auth/auth-submit-button'
import { RequiredMark } from '@/components/ui/required-mark'
import { useGeminiArSuggestion } from '@/hooks/use-gemini-ar-suggestion'
import { useGeminiEnSuggestion } from '@/hooks/use-gemini-en-suggestion'
import { useRouter } from '@/i18n/navigation'
import { AuthApiError, authGet, authPatch, authPost } from '@/lib/api/auth-client'
import { COMPANY_LOGO_MIME_TYPES } from '@/lib/auth/company-logo'
import { readLogoFileAsBase64 } from '@/lib/clients/read-logo-file-as-base64'
import {
  shouldEnableBilingualTranslate,
  useBilingualFieldOrigin,
} from '@/lib/i18n/use-bilingual-field-origin'
import { scrollAfterFieldValidation } from '@/lib/ui/scroll-first-invalid-field'
import { cn } from '@/lib/utils'

const LOGO_ACCEPT = COMPANY_LOGO_MIME_TYPES.join(',')
const PAIR_KEY = 'menu-item-name'

const fieldClass =
  'type-body-md text-hisabi-on-surface placeholder:text-hisabi-outline/70 w-full rounded-lg border border-hisabi-outline-variant bg-hisabi-surface px-hisabi-md py-hisabi-sm outline-none transition-shadow focus:border-hisabi-primary focus:ring-2 focus:ring-hisabi-primary/10'

/** Hisabi product-form: select + inline Add in one shell. */
const categorySelectAddShell =
  'flex min-h-[2.75rem] w-full min-w-0 items-stretch overflow-hidden rounded-lg border border-hisabi-outline-variant/60 bg-hisabi-surface-container-lowest transition-shadow focus-within:border-hisabi-primary focus-within:ring-2 focus-within:ring-hisabi-primary/10'

const categorySelectInnerClass =
  'type-body-md text-hisabi-on-surface h-full min-h-[2.75rem] w-full min-w-0 flex-1 appearance-none rounded-none border-0 bg-transparent px-hisabi-md py-hisabi-sm pe-10 shadow-none outline-none ring-0 focus:ring-0 disabled:opacity-50'

const categoryAddButtonClass =
  'type-body-md shrink-0 cursor-pointer border-0 border-s border-hisabi-outline-variant bg-transparent px-hisabi-md py-hisabi-sm font-medium text-hisabi-on-surface-variant shadow-none outline-none transition-colors hover:bg-hisabi-surface-container-low focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-hisabi-primary/20'

/**
 * @param {{
 *   title: string
 *   icon: 'package' | 'tags'
 *   children: import('react').ReactNode
 *   alignDoc: string
 * }} props
 */
function MenuItemFormSection({ title, icon, children, alignDoc }) {
  const Icon = icon === 'tags' ? Tags : Package
  return (
    <section className="overflow-hidden rounded-xl border border-hisabi-outline-variant/30 bg-hisabi-surface-container-lowest shadow-sm space-y-hisabi-lg">
      <div className="flex items-center gap-hisabi-md border-b border-hisabi-outline-variant/20 px-hisabi-xl py-hisabi-lg sm:px-hisabi-xxl">
        <span
          className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-hisabi-secondary-fixed text-hisabi-primary shadow-hisabi-1"
          aria-hidden
        >
          <Icon className="size-5" aria-hidden />
        </span>
        <h3
          className={cn(
            'type-headline-md font-bold text-hisabi-primary',
            alignDoc,
          )}
        >
          {title}
        </h3>
      </div>
      <div className="space-y-hisabi-xl px-hisabi-xl pb-hisabi-xl pt-hisabi-md sm:px-hisabi-xxl sm:pb-hisabi-xxl sm:pt-hisabi-lg">
        {children}
      </div>
    </section>
  )
}

/**
 * @param {{
 *   mode: 'create' | 'edit'
 *   itemId?: string
 * }} props
 */
export function MenuItemFormView({ mode, itemId }) {
  const t = useTranslations('Menu')
  const tBi = useTranslations('BilingualInvoiceCompany')
  const tErr = useTranslations('AuthErrors')
  const locale = useLocale()
  const router = useRouter()
  const queryClient = useQueryClient()
  const titleId = useId()
  const imageInputId = useId()
  const isRtl = locale === 'ar'
  const alignDoc = isRtl ? 'text-end' : 'text-start'

  const bilingualFieldOrigin = useBilingualFieldOrigin()
  const { origin, reportUserInput, markAutoFilled, consumeAutoFillSkip } =
    bilingualFieldOrigin

  const [nameAr, setNameAr] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [price, setPrice] = useState('')
  const [vatPreset, setVatPreset] = useState(
    /** @type {'standard'|'zero'|'exempt'} */ ('standard'),
  )
  const [categoryId, setCategoryId] = useState('')
  const [sortOrder, setSortOrder] = useState('0')
  const [active, setActive] = useState(true)
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({ nameAr: '' })
  const [hydrated, setHydrated] = useState(mode === 'create')
  const [nameEnBaseline, setNameEnBaseline] = useState('')
  const [nameArBaseline, setNameArBaseline] = useState('')
  const [categoryModalOpen, setCategoryModalOpen] = useState(false)
  /** @type {[null | 'clear' | { base64: string, mime: string }, Function]} */
  const [imageNext, setImageNext] = useState(
    /** @type {null | 'clear' | { base64: string, mime: string }} */ (null),
  )

  const { loading: loadingNameAr } = useGeminiArSuggestion(
    nameEn,
    (ar) => {
      markAutoFilled('ar', PAIR_KEY, ar)
      setNameAr(ar.slice(0, 200))
    },
    {
      enabled:
        hydrated &&
        !categoryModalOpen &&
        shouldEnableBilingualTranslate(origin, 'en', nameAr),
      shouldSkip: (trimmed) => consumeAutoFillSkip(PAIR_KEY, 'en', trimmed),
      englishBaseline: mode === 'edit' ? nameEnBaseline : undefined,
    },
  )
  const { loading: loadingNameEn } = useGeminiEnSuggestion(
    nameAr,
    (en) => {
      markAutoFilled('en', PAIR_KEY, en)
      setNameEn(en.slice(0, 200))
    },
    {
      enabled:
        hydrated &&
        !categoryModalOpen &&
        shouldEnableBilingualTranslate(origin, 'ar', nameEn),
      shouldSkip: (trimmed) => consumeAutoFillSkip(PAIR_KEY, 'ar', trimmed),
      arabicBaseline: mode === 'edit' ? nameArBaseline : undefined,
    },
  )

  const categoriesQuery = useQuery({
    queryKey: ['menu', 'categories', 'active'],
    queryFn: async () => {
      const d = await authGet('/menu/categories?active=true')
      return d.categories ?? []
    },
  })

  const itemQuery = useQuery({
    queryKey: ['menu', 'items', itemId],
    queryFn: async () => {
      const d = await authGet(`/menu/items/${itemId}`)
      return d.item
    },
    enabled: mode === 'edit' && Boolean(itemId),
  })

  /* eslint-disable react-hooks/set-state-in-effect -- hydrate edit form once from query */
  useEffect(() => {
    if (!itemQuery.data || hydrated) return
    const item = itemQuery.data
    setNameAr(item.nameAr ?? '')
    setNameEn(item.nameEn ?? '')
    setNameArBaseline(item.nameAr ?? '')
    setNameEnBaseline(item.nameEn ?? '')
    setPrice(item.price ?? '')
    setVatPreset(item.vatPreset ?? 'standard')
    setCategoryId(item.categoryId ?? '')
    setSortOrder(String(item.sortOrder ?? 0))
    setActive(item.active !== false)
    setImageNext(null)
    setHydrated(true)
  }, [itemQuery.data, hydrated])
  /* eslint-enable react-hooks/set-state-in-effect */

  const saveMutation = useMutation({
    mutationFn: async () => {
      /** @type {Record<string, unknown>} */
      const body = {
        nameAr: nameAr.trim(),
        nameEn: nameEn.trim() || null,
        price: price.trim(),
        vatPreset,
        categoryId: categoryId || null,
        sortOrder: Number.parseInt(sortOrder, 10) || 0,
        active,
      }
      if (imageNext === 'clear') {
        body.clearImage = true
      } else if (imageNext && typeof imageNext === 'object') {
        body.imageBase64 = imageNext.base64
        body.imageMimeType = imageNext.mime
        body.clearImage = false
      }
      if (mode === 'edit' && itemId) {
        return authPatch(`/menu/items/${itemId}`, body)
      }
      return authPost('/menu/items', body)
    },
    onSuccess: () => {
      toast.success(t('saved'))
      router.push('/menu')
      router.refresh()
    },
    onError: (err) => {
      const code = err instanceof AuthApiError ? err.code : undefined
      setFormError(code ? tErr(code) : tErr('generic'))
    },
  })

  function handleClose() {
    router.push('/menu')
  }

  function handleSubmit(e) {
    e.preventDefault()
    setFormError('')
    if (!nameAr.trim()) {
      setFieldErrors({ nameAr: t('validationNameAr') })
      scrollAfterFieldValidation()
      return
    }
    setFieldErrors({ nameAr: '' })
    if (!/^\d+(\.\d{1,4})?$/.test(price.trim())) {
      setFormError(t('validationPrice'))
      return
    }
    saveMutation.mutate()
  }

  const item = itemQuery.data
  const imagePreviewSrc =
    imageNext && typeof imageNext === 'object'
      ? `data:${imageNext.mime};base64,${imageNext.base64}`
      : imageNext === 'clear'
        ? null
        : mode === 'edit' && item && typeof item.imageUrl === 'string'
          ? item.imageUrl
          : null

  if (mode === 'edit' && (itemQuery.isPending || !hydrated)) {
    return (
      <div className="flex justify-center py-hisabi-xxl">
        <AppLoader />
      </div>
    )
  }

  if (mode === 'edit' && itemQuery.isError) {
    return (
      <p className="type-body-md text-hisabi-error" role="alert">
        {tErr('generic')}
      </p>
    )
  }

  return (
    <div className="min-h-screen bg-transparent pb-hisabi-xxl">
      <header className="border-b border-transparent bg-transparent">
        <div className="mx-auto flex min-h-20 max-w-hisabi-container flex-wrap items-center gap-hisabi-md px-hisabi-md py-hisabi-md sm:px-hisabi-xl">
          <button
            type="button"
            onClick={handleClose}
            className="text-hisabi-primary hover:bg-hisabi-surface-container-low flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors"
            aria-label={t('backToMenu')}
          >
            <ChevronLeft className="size-5 rtl:rotate-180" aria-hidden />
          </button>
          <div className="min-w-0 flex-1">
            <h1
              id={titleId}
              className={cn(
                'type-headline-xl text-hisabi-on-surface tracking-tight',
                alignDoc,
              )}
            >
              {mode === 'edit' ? t('itemEditTitle') : t('itemNewTitle')}
            </h1>
            <p
              className={cn(
                'type-body-md text-hisabi-on-surface-variant mt-0.5 max-w-2xl',
                alignDoc,
              )}
            >
              {mode === 'edit' ? t('itemEditSubtitle') : t('itemNewSubtitle')}
            </p>
          </div>
        </div>
      </header>

      <form
        noValidate
        className="flex flex-col"
        onSubmit={handleSubmit}
        aria-labelledby={titleId}
      >
        <div className="mx-auto w-full max-w-hisabi-container space-y-hisabi-lg px-hisabi-md sm:px-hisabi-xl">
          {formError ? (
            <p className="type-body-md text-hisabi-error" role="alert">
              {formError}
            </p>
          ) : null}

          <MenuItemFormSection
            title={t('sectionBasicInfo')}
            icon="package"
            alignDoc={alignDoc}
          >
            <div
              dir="ltr"
              className="grid grid-cols-1 gap-x-hisabi-lg gap-y-hisabi-md min-[480px]:grid-cols-2"
            >
              <div className="min-w-0 space-y-hisabi-xs text-start">
                <label
                  className="type-label-md text-hisabi-on-surface-variant flex items-center gap-2"
                  htmlFor="item-name-en"
                >
                  {t('itemNameEn')}
                  {loadingNameEn ? (
                    <Loader2
                      className="text-hisabi-teal size-4 shrink-0 animate-spin"
                      aria-label={tBi('translating')}
                    />
                  ) : null}
                </label>
                <input
                  id="item-name-en"
                  value={nameEn}
                  onChange={(e) => {
                    const next = e.target.value.slice(0, 200)
                    reportUserInput('en', PAIR_KEY, {
                      otherFieldEmpty: !nameAr.trim(),
                    })
                    setNameEn(next)
                  }}
                  placeholder={t('itemNameEnPlaceholder')}
                  dir="ltr"
                  className={fieldClass}
                />
              </div>
              <div className="min-w-0 space-y-hisabi-xs text-start">
                <label
                  className="type-label-md text-hisabi-on-surface-variant flex items-center gap-2"
                  htmlFor="item-name-ar"
                >
                  {t('itemNameAr')}
                  <RequiredMark />
                  {loadingNameAr ? (
                    <Loader2
                      className="text-hisabi-teal size-4 shrink-0 animate-spin"
                      aria-label={tBi('translating')}
                    />
                  ) : null}
                </label>
                <input
                  id="item-name-ar"
                  value={nameAr}
                  onChange={(e) => {
                    const next = e.target.value.slice(0, 200)
                    reportUserInput('ar', PAIR_KEY, {
                      otherFieldEmpty: !nameEn.trim(),
                    })
                    setNameAr(next)
                    setFieldErrors((prev) =>
                      prev.nameAr ? { ...prev, nameAr: '' } : prev,
                    )
                  }}
                  placeholder={t('itemNameArPlaceholder')}
                  required
                  dir="rtl"
                  className={cn(
                    fieldClass,
                    fieldErrors.nameAr &&
                      'border-hisabi-error focus:border-hisabi-error focus:ring-hisabi-error/25',
                  )}
                  aria-invalid={fieldErrors.nameAr ? true : undefined}
                  aria-describedby={
                    fieldErrors.nameAr ? 'item-name-ar-error' : undefined
                  }
                />
                {fieldErrors.nameAr ? (
                  <p
                    id="item-name-ar-error"
                    className="type-body-sm text-hisabi-error"
                    role="alert"
                  >
                    {fieldErrors.nameAr}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="space-y-hisabi-xs">
              <p
                className={cn(
                  'type-label-md text-hisabi-on-surface-variant',
                  alignDoc,
                )}
              >
                {t('fieldImage')}
              </p>
              <label
                htmlFor={imageInputId}
                className="border-hisabi-outline-variant text-hisabi-on-surface-variant hover:border-hisabi-primary flex min-h-[8rem] cursor-pointer flex-col items-center justify-center gap-hisabi-xs rounded-xl border-2 border-dashed bg-hisabi-surface p-hisabi-lg transition-colors"
              >
                {imagePreviewSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local/data preview
                  <img
                    src={imagePreviewSrc}
                    alt=""
                    className="max-h-32 w-full object-contain"
                  />
                ) : (
                  <>
                    <CloudUpload className="size-8" aria-hidden />
                    <span className="type-body-sm text-center">
                      {t('imageDropHint')}
                    </span>
                  </>
                )}
                <input
                  id={imageInputId}
                  type="file"
                  accept={LOGO_ACCEPT}
                  className="sr-only"
                  onChange={async (e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    if (!f) return
                    try {
                      const { base64, mime } = await readLogoFileAsBase64(f)
                      setImageNext({ base64, mime })
                    } catch {
                      toast.error(t('imagePickError'))
                    }
                  }}
                />
              </label>
              {(mode === 'edit' &&
                item &&
                typeof item.imageUrl === 'string' &&
                !imageNext) ||
              imageNext ? (
                <div className="flex flex-wrap gap-hisabi-sm">
                  {imageNext === 'clear' ? (
                    <button
                      type="button"
                      className="type-label-sm text-hisabi-primary cursor-pointer hover:underline"
                      onClick={() => setImageNext(null)}
                    >
                      {t('undoRemoveImage')}
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="type-label-sm text-hisabi-error cursor-pointer hover:underline"
                        onClick={() =>
                          setImageNext(
                            imageNext && typeof imageNext === 'object'
                              ? null
                              : 'clear',
                          )
                        }
                      >
                        {t('removeImage')}
                      </button>
                      <button
                        type="button"
                        className="type-label-sm text-hisabi-primary cursor-pointer hover:underline"
                        onClick={() =>
                          document.getElementById(imageInputId)?.click()
                        }
                      >
                        {t('replaceImage')}
                      </button>
                    </>
                  )}
                </div>
              ) : null}
              {imageNext === 'clear' ? (
                <p className="type-body-sm text-hisabi-on-surface-variant">
                  {t('imageRemovedOnSave')}
                </p>
              ) : null}
            </div>
          </MenuItemFormSection>

          <MenuItemFormSection
            title={t('sectionPricing')}
            icon="tags"
            alignDoc={alignDoc}
          >
            <div className="space-y-hisabi-xs">
              <label
                className={cn(
                  'type-label-md text-hisabi-on-surface-variant block',
                  alignDoc,
                )}
                htmlFor="item-price"
              >
                {t('priceLabel')}
                <RequiredMark />
              </label>
              <input
                id="item-price"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder={t('pricePlaceholder')}
                required
                dir="ltr"
                className={fieldClass}
              />
            </div>

            <div className="space-y-hisabi-xs">
              <label
                className={cn(
                  'type-label-md text-hisabi-on-surface-variant block',
                  alignDoc,
                )}
                htmlFor="item-vat"
              >
                {t('vatLabel')}
                <RequiredMark />
              </label>
              <select
                id="item-vat"
                value={vatPreset}
                onChange={(e) =>
                  setVatPreset(
                    /** @type {'standard'|'zero'|'exempt'} */ (e.target.value),
                  )
                }
                className={fieldClass}
              >
                <option value="standard">{t('vatStandard')}</option>
                <option value="zero">{t('vatZero')}</option>
                <option value="exempt">{t('vatExempt')}</option>
              </select>
            </div>

            <div className="space-y-hisabi-xs">
              <label
                className={cn(
                  'type-label-md text-hisabi-on-surface-variant block',
                  alignDoc,
                )}
                htmlFor="item-cat"
              >
                {t('categoryLabel')}
              </label>
              <div
                className={cn(
                  categorySelectAddShell,
                  isRtl && 'flex-row-reverse',
                )}
                dir="ltr"
              >
                <div className="relative min-w-0 flex-1">
                  <select
                    id="item-cat"
                    value={categoryId}
                    dir={isRtl ? 'rtl' : 'ltr'}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className={cn(
                      categorySelectInnerClass,
                      isRtl && 'ps-10 pe-hisabi-md',
                    )}
                    disabled={categoriesQuery.isPending}
                  >
                    <option value="">{t('categoryNone')}</option>
                    {(categoriesQuery.data ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nameAr}
                        {c.nameEn ? ` / ${c.nameEn}` : ''}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    className={cn(
                      'text-hisabi-outline pointer-events-none absolute top-1/2 size-5 -translate-y-1/2',
                      isRtl ? 'start-3' : 'end-3',
                    )}
                    aria-hidden
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setCategoryModalOpen(true)}
                  className={cn(
                    categoryAddButtonClass,
                    isRtl &&
                      'border-s-0 border-e border-hisabi-outline-variant',
                  )}
                  aria-label={t('manageCategories')}
                >
                  {t('categoryAdd')}
                </button>
              </div>
            </div>

            <div className="space-y-hisabi-xs">
              <label
                className={cn(
                  'type-label-md text-hisabi-on-surface-variant block',
                  alignDoc,
                )}
                htmlFor="item-sort"
              >
                {t('sortOrderLabel')}
              </label>
              <input
                id="item-sort"
                inputMode="numeric"
                value={sortOrder}
                onChange={(e) =>
                  setSortOrder(e.target.value.replace(/\D/g, '').slice(0, 4))
                }
                placeholder={t('sortOrderPlaceholder')}
                dir="ltr"
                className={fieldClass}
              />
            </div>

            <fieldset className="space-y-hisabi-xs">
              <legend
                className={cn(
                  'type-label-md text-hisabi-on-surface-variant',
                  alignDoc,
                )}
              >
                {t('activeLabel')}
              </legend>
              <div className="flex w-full max-w-sm rounded-lg border border-hisabi-outline-variant/60 bg-white p-1">
                {(
                  /** @type {const} */ ([
                    [true, 'statusActive'],
                    [false, 'statusInactive'],
                  ])
                ).map(([value, labelKey]) => (
                  <button
                    key={String(value)}
                    type="button"
                    onClick={() => setActive(value)}
                    className={cn(
                      'type-label-sm flex min-w-0 flex-1 cursor-pointer items-center justify-center rounded-lg px-2 py-2.5 text-center font-bold transition-colors',
                      active === value
                        ? 'bg-hisabi-primary-container text-white'
                        : 'text-hisabi-on-surface-variant hover:bg-hisabi-surface-container',
                    )}
                  >
                    {t(labelKey)}
                  </button>
                ))}
              </div>
            </fieldset>
          </MenuItemFormSection>
        </div>

        <div className="mx-auto mt-hisabi-xl flex w-full max-w-hisabi-container flex-col-reverse gap-hisabi-md border-t border-hisabi-outline-variant/20 px-hisabi-md pt-hisabi-xl pb-hisabi-lg sm:px-hisabi-xl min-[500px]:flex-row min-[500px]:justify-end min-[500px]:gap-hisabi-xl min-[500px]:border-t-0 min-[500px]:pb-hisabi-xxl min-[500px]:pt-0">
          <button
            type="button"
            onClick={handleClose}
            className="type-label-md text-hisabi-primary hover:bg-hisabi-surface-container-low inline-flex min-h-[52px] w-full min-w-0 cursor-pointer items-center justify-center rounded-lg border border-hisabi-primary/20 px-hisabi-lg font-semibold transition-all active:scale-[0.98] min-[500px]:w-auto min-[500px]:min-w-[10rem]"
          >
            {t('cancel')}
          </button>
          <AuthSubmitButton
            type="submit"
            variant="gold"
            pending={saveMutation.isPending}
            className="min-h-0 w-full min-w-0 py-4 min-[500px]:w-auto min-[500px]:min-w-[12rem]"
          >
            <span className="flex items-center justify-center gap-hisabi-sm">
              <Save className="size-5 shrink-0" aria-hidden />
              {saveMutation.isPending ? t('saving') : t('save')}
            </span>
          </AuthSubmitButton>
        </div>
      </form>

      <MenuCategoryEditModal
        open={categoryModalOpen}
        onOpenChange={setCategoryModalOpen}
        category={null}
        onSuccess={async (created) => {
          await queryClient.invalidateQueries({
            queryKey: ['menu', 'categories'],
          })
          setCategoryId(created.id)
        }}
      />
    </div>
  )
}
