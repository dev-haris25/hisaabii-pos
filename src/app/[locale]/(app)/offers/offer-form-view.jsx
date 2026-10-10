'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  BadgePercent,
  CalendarClock,
  Gauge,
  Gift,
  ImageIcon,
  Package,
  Plus,
  Save,
  Shapes,
  ShoppingBag,
  Tag,
  Trash2,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useId, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import {
  formatMoney,
  isoToRiyadhInput,
  riyadhInputToIso,
  weekdayNames,
} from './offer-format'
import { OfferImageField } from './offer-image-field'
import { AuthSubmitButton } from '@/components/auth/auth-submit-button'
import { useIsRtl } from '@/components/auth/use-is-rtl'
import { HisabiSpinner } from '@/components/hisabi-spinner'
import { HisabiStatusModal } from '@/components/hisabi-status-modal'
import { SearchableEntityPicker } from '@/components/invoices/searchable-entity-picker'
import { SettingsSection } from '@/components/settings/settings-page-shell'
import { PageBackButton } from '@/components/shared/page-back-button'
import { RequiredMark } from '@/components/ui/required-mark'
import { useGeminiArSuggestion } from '@/hooks/use-gemini-ar-suggestion'
import { useGeminiEnSuggestion } from '@/hooks/use-gemini-en-suggestion'
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard'
import { useRouter } from '@/i18n/navigation'
import { AuthApiError, authGet, authPatch, authPost } from '@/lib/api/auth-client'
import { comboHighestNormalTotal } from '@/lib/offers/combo-normal-total'
import { toastAuthApiError } from '@/lib/api/toast-auth-api-error'
import {
  shouldEnableBilingualTranslate,
  useBilingualFieldOrigin,
} from '@/lib/i18n/use-bilingual-field-origin'
import {
  decimalStringFromNumber,
  parseMoney,
} from '@/lib/invoices/invoice-compute-totals'
import { scrollAfterFieldValidation } from '@/lib/ui/scroll-first-invalid-field'
import { cn } from '@/lib/utils'

const NAME_PAIR_KEY = 'offer.name'

const SEGMENT_SHELL =
  'flex w-full rounded-lg border border-hisabi-outline-variant/60 bg-white p-1'

/** Match Menu / Settings / Coupon form fields. */
const fieldClass =
  'type-body-md text-hisabi-on-surface placeholder:text-hisabi-outline/70 w-full rounded-lg border border-hisabi-outline-variant bg-hisabi-surface-container-lowest px-hisabi-md py-3 outline-none transition-shadow focus:border-hisabi-primary focus:ring-1 focus:ring-hisabi-primary/15'
const fieldInvalidClass =
  'border-hisabi-error focus:border-hisabi-error focus:ring-hisabi-error/25'

const FORM_FOOTER_CLASS =
  'flex w-full flex-col-reverse gap-hisabi-md border-t border-hisabi-outline-variant/20 pt-hisabi-xl min-[500px]:flex-row min-[500px]:justify-end min-[500px]:gap-hisabi-xl'

const SECONDARY_BTN_CLASS =
  'type-label-md text-hisabi-primary hover:bg-hisabi-surface-container-low inline-flex min-h-[52px] w-full min-w-0 cursor-pointer items-center justify-center rounded-lg border border-hisabi-primary/20 px-hisabi-lg font-semibold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 min-[500px]:w-auto min-[500px]:min-w-[10rem]'

const LABEL_CLASS =
  'type-label-md text-hisabi-on-surface-variant flex items-center gap-1 text-start'

const HINT_CLASS = 'type-body-sm text-hisabi-on-surface-variant'

const MONEY_RE = /^\d+(\.\d{1,4})?$/
const INT_RE = /^\d+$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const MAX_LIMIT = 1_000_000
const MAX_QTY = 99
const COMBO_MIN_ITEMS = 2
const COMBO_MAX_ITEMS = 3

/** Server AuthErrors → form field. */
const OFFER_ERROR_FIELD_MAP = {
  OFFER_DATE_RANGE_INVALID: 'endsAt',
  OFFER_TIME_WINDOW_INVALID: 'dailyEndTime',
  OFFER_DISCOUNT_TYPE_REQUIRED: 'discountType',
  OFFER_DISCOUNT_VALUE_INVALID: 'discountValue',
  OFFER_TARGET_ITEMS_REQUIRED: 'targetRows',
  OFFER_BUY_GET_REQUIRED: 'buyRows',
  OFFER_COMBO_ITEMS_RANGE: 'comboRows',
  OFFER_COMBO_PRICE_INVALID: 'comboPrice',
  OFFER_COMBO_NO_SAVINGS: 'comboPrice',
  OFFER_IMAGE_INVALID: 'images',
  OFFER_IMAGE_TOO_LARGE: 'images',
}

/** @typedef {'DISCOUNT' | 'BUY_X_GET_Y' | 'COMBO'} OfferKind */

/**
 * @typedef {{
 *   clientId: string
 *   menuItemId: string
 *   quantity: string
 *   discountPercent: string
 *   restrictVariants: boolean
 *   variantOptionIds: string[]
 * }} OfferItemRow
 */

function newClientId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/**
 * @param {'TARGET' | 'BUY' | 'GET' | 'COMBO_ITEM'} role
 * @returns {OfferItemRow}
 */
function emptyRow(role) {
  return {
    clientId: newClientId(),
    menuItemId: '',
    quantity: '1',
    discountPercent: role === 'GET' ? '100' : '',
    restrictVariants: false,
    variantOptionIds: [],
  }
}

/**
 * @param {Array<Record<string, any>> | undefined} items
 * @param {'TARGET' | 'BUY' | 'GET' | 'COMBO_ITEM'} role
 * @returns {OfferItemRow[]}
 */
function rowsFromOffer(items, role) {
  if (!Array.isArray(items)) return []
  return items
    .filter((it) => it && it.role === role)
    .map((it) => {
      const ids = Array.isArray(it.variantOptionIds)
        ? it.variantOptionIds.filter((id) => typeof id === 'string' && id)
        : []
      return {
        clientId: typeof it.id === 'string' ? it.id : newClientId(),
        menuItemId: typeof it.menuItemId === 'string' ? it.menuItemId : '',
        quantity: String(it.quantity ?? 1),
        discountPercent:
          role === 'GET'
            ? it.discountPercent != null && it.discountPercent !== ''
              ? String(Math.round(parseMoney(it.discountPercent) * 100) / 100)
              : '100'
            : '',
        restrictVariants: ids.length > 0,
        variantOptionIds: ids,
      }
    })
}

/** @param {unknown} v */
function limitToInput(v) {
  return typeof v === 'number' && Number.isFinite(v) ? String(v) : ''
}

/**
 * @param {'create' | 'edit'} mode
 * @param {Record<string, any> | null} offer
 */
function initialFormState(mode, offer) {
  const o = mode === 'edit' && offer ? offer : null
  const kind =
    o && ['DISCOUNT', 'BUY_X_GET_Y', 'COMBO'].includes(o.kind)
      ? /** @type {OfferKind} */ (o.kind)
      : /** @type {OfferKind | ''} */ ('')
  const targetRows = rowsFromOffer(o?.items, 'TARGET')
  const buyRows = rowsFromOffer(o?.items, 'BUY')
  const getRows = rowsFromOffer(o?.items, 'GET')
  const comboRows = rowsFromOffer(o?.items, 'COMBO_ITEM')
  return {
    kind,
    nameAr: typeof o?.nameAr === 'string' ? o.nameAr : '',
    nameEn: typeof o?.nameEn === 'string' ? o.nameEn : '',
    discountType:
      o?.discountType === 'FIXED_AMOUNT' ? 'FIXED_AMOUNT' : 'PERCENTAGE',
    discountValue:
      o?.discountValue != null && o.discountValue !== ''
        ? o.discountType === 'PERCENTAGE'
          ? String(Math.round(parseMoney(o.discountValue) * 100) / 100)
          : String(o.discountValue)
        : '',
    appliesToAllItems: o ? o.appliesToAllItems === true : true,
    targetRows: targetRows.length > 0 ? targetRows : [emptyRow('TARGET')],
    buyRows: buyRows.length > 0 ? buyRows : [emptyRow('BUY')],
    getRows: getRows.length > 0 ? getRows : [emptyRow('GET')],
    comboRows:
      comboRows.length > 0
        ? comboRows
        : [emptyRow('COMBO_ITEM'), emptyRow('COMBO_ITEM')],
    comboPrice:
      o?.comboPrice != null && o.comboPrice !== '' ? String(o.comboPrice) : '',
    startsAt: isoToRiyadhInput(o?.startsAt),
    endsAt: isoToRiyadhInput(o?.endsAt),
    dailyStartTime: typeof o?.dailyStartTime === 'string' ? o.dailyStartTime : '',
    dailyEndTime: typeof o?.dailyEndTime === 'string' ? o.dailyEndTime : '',
    weekdays: Array.isArray(o?.weekdays)
      ? [...o.weekdays].filter((d) => Number.isInteger(d)).sort((a, b) => a - b)
      : /** @type {number[]} */ ([]),
    totalUsageLimit: limitToInput(o?.totalUsageLimit),
    dailyUsageLimit: limitToInput(o?.dailyUsageLimit),
    maxPerOrder: limitToInput(o?.maxPerOrder),
    active: o ? o.active === true : true,
  }
}

/** @typedef {ReturnType<typeof initialFormState>} OfferFormState */

/**
 * Dirty-check snapshot (rows without client ids; images as flags only).
 * @param {OfferFormState} form
 * @param {unknown} bannerNext
 * @param {unknown} imageNext
 */
function snapshotOf(form, bannerNext, imageNext) {
  /** @param {OfferItemRow[]} rows */
  const strip = (rows) =>
    rows.map((r) => [
      r.menuItemId,
      r.quantity,
      r.discountPercent,
      r.restrictVariants,
      [...r.variantOptionIds].sort(),
    ])
  const imageFlag = (v) => (v == null ? null : v === 'clear' ? 'clear' : 'new')
  return JSON.stringify({
    ...form,
    targetRows: strip(form.targetRows),
    buyRows: strip(form.buyRows),
    getRows: strip(form.getRows),
    comboRows: strip(form.comboRows),
    banner: imageFlag(bannerNext),
    image: imageFlag(imageNext),
  })
}

/** @param {boolean} selected */
function segmentOptionClass(selected) {
  return cn(
    'type-label-sm flex min-w-0 flex-1 cursor-pointer items-center justify-center rounded-lg px-2 py-2.5 text-center font-bold transition-colors',
    selected
      ? 'bg-hisabi-primary-container text-white'
      : 'text-hisabi-on-surface-variant hover:bg-hisabi-surface-container',
  )
}

/**
 * @param {{
 *   mode: 'create' | 'edit'
 *   offer?: Record<string, any> | null
 * }} props
 */
export function OfferFormView({ mode, offer = null }) {
  const t = useTranslations('Offers')
  const tErr = useTranslations('AuthErrors')
  const tBi = useTranslations('BilingualInvoiceCompany')
  const locale = useLocale()
  const isRtl = useIsRtl()
  const router = useRouter()
  const titleId = useId()
  const alignDoc = isRtl ? 'text-end' : 'text-start'
  const { origin, reportUserInput, markAutoFilled, consumeAutoFillSkip } =
    useBilingualFieldOrigin()

  const offerId = mode === 'edit' && typeof offer?.id === 'string' ? offer.id : ''

  const [form, setForm] = useState(() => initialFormState(mode, offer))
  const [baseline] = useState(() =>
    snapshotOf(initialFormState(mode, offer), null, null),
  )
  const [nameArBaseline] = useState(() => form.nameAr)
  const [nameEnBaseline] = useState(() => form.nameEn)
  const [currentStep, setCurrentStep] = useState(
    /** @type {1 | 2} */ (mode === 'edit' ? 2 : 1),
  )
  const [bannerNext, setBannerNext] = useState(
    /** @type {import('./offer-image-field').OfferImageNext} */ (null),
  )
  const [imageNext, setImageNext] = useState(
    /** @type {import('./offer-image-field').OfferImageNext} */ (null),
  )
  const [fieldErrors, setFieldErrors] = useState(
    /** @type {Record<string, string>} */ ({}),
  )
  const [formError, setFormError] = useState('')
  const [leaveModalOpen, setLeaveModalOpen] = useState(false)
  const pendingLeaveRef = useRef(
    /** @type {import('@/hooks/use-unsaved-changes-guard').UnsavedLeaveTarget | null} */ (
      null
    ),
  )
  const [saved, setSaved] = useState(false)

  const kind = form.kind
  const kindReady = Boolean(kind)

  /** @param {Partial<OfferFormState>} patch */
  function patchForm(patch) {
    setForm((prev) => ({ ...prev, ...patch }))
  }

  function clearFieldError(key) {
    setFieldErrors((prev) => (prev[key] ? { ...prev, [key]: '' } : prev))
  }

  const isDirty =
    !saved && snapshotOf(form, bannerNext, imageNext) !== baseline

  const { proceed: proceedLeave, allowNextNavigation } = useUnsavedChangesGuard({
    isDirty,
    onBlock: (target) => {
      pendingLeaveRef.current = target
      setLeaveModalOpen(true)
    },
  })

  const { loading: loadingNameAr } = useGeminiArSuggestion(
    form.nameEn,
    (ar) => {
      markAutoFilled('ar', NAME_PAIR_KEY, ar)
      patchForm({ nameAr: ar.slice(0, 200) })
    },
    {
      enabled:
        currentStep === 2 &&
        shouldEnableBilingualTranslate(origin, 'en', form.nameAr),
      shouldSkip: (trimmed) => consumeAutoFillSkip(NAME_PAIR_KEY, 'en', trimmed),
      englishBaseline: mode === 'edit' ? nameEnBaseline : undefined,
    },
  )
  const { loading: loadingNameEn } = useGeminiEnSuggestion(
    form.nameAr,
    (en) => {
      markAutoFilled('en', NAME_PAIR_KEY, en)
      patchForm({ nameEn: en.slice(0, 200) })
    },
    {
      enabled:
        currentStep === 2 &&
        shouldEnableBilingualTranslate(origin, 'ar', form.nameEn),
      shouldSkip: (trimmed) => consumeAutoFillSkip(NAME_PAIR_KEY, 'ar', trimmed),
      arabicBaseline: mode === 'edit' ? nameArBaseline : undefined,
    },
  )

  const menuItemsQuery = useQuery({
    queryKey: ['menu', 'items', 'active-picker'],
    queryFn: async () => {
      const d = await authGet('/menu/items?active=true')
      return d.items ?? []
    },
    enabled: currentStep === 2,
  })

  /** @type {Map<string, Record<string, any>>} */
  const menuItemById = useMemo(() => {
    const map = new Map()
    for (const item of menuItemsQuery.data ?? []) {
      if (item?.id) map.set(item.id, item)
    }
    return map
  }, [menuItemsQuery.data])

  /** Saved offer items whose menu item is now turned off (edit only). */
  const inactiveSavedItems = useMemo(() => {
    /** @type {Map<string, { nameAr: string, nameEn: string | null }>} */
    const map = new Map()
    for (const it of Array.isArray(offer?.items) ? offer.items : []) {
      if (it && it.menuItemActive === false && typeof it.menuItemId === 'string') {
        map.set(it.menuItemId, {
          nameAr: it.menuItemNameAr ?? '',
          nameEn: it.menuItemNameEn ?? null,
        })
      }
    }
    return map
  }, [offer])

  /** @param {{ nameAr?: string, nameEn?: string | null }} row */
  function bilingualLabel(row) {
    if (locale === 'ar') return row.nameAr || row.nameEn || ''
    const en = typeof row.nameEn === 'string' ? row.nameEn.trim() : ''
    return en || row.nameAr || ''
  }

  const menuPickerItems = useMemo(() => {
    const list = (menuItemsQuery.data ?? []).map((item) => ({
      id: item.id,
      label:
        locale === 'ar' ? item.nameAr : item.nameEn?.trim() || item.nameAr,
      sublabel: `${formatMoney(item.price)} ${t('currency')}`,
    }))
    for (const [id, names] of inactiveSavedItems) {
      if (!menuItemById.has(id)) {
        list.push({
          id,
          label:
            locale === 'ar'
              ? names.nameAr || names.nameEn || ''
              : names.nameEn?.trim() || names.nameAr,
          sublabel: t('itemTurnedOff'),
        })
      }
    }
    return list
  }, [menuItemsQuery.data, locale, inactiveSavedItems, menuItemById, t])

  /**
   * @param {string} menuItemId
   * @returns {Array<{ id: string, nameAr: string, nameEn: string | null, options: Array<{ id: string, nameAr: string, nameEn: string | null }> }>}
   */
  function variantGroupsForItem(menuItemId) {
    const groups = menuItemById.get(menuItemId)?.variantGroups
    if (!Array.isArray(groups)) return []
    return groups
      .filter((g) => g && Array.isArray(g.options) && g.options.length > 0)
      .map((g) => ({
        id: String(g.id),
        nameAr: String(g.nameAr ?? ''),
        nameEn: g.nameEn ?? null,
        options: g.options.map((o) => ({
          id: String(o.id),
          nameAr: String(o.nameAr ?? ''),
          nameEn: o.nameEn ?? null,
        })),
      }))
  }

  /** @param {string} menuItemId */
  function menuItemPrice(menuItemId) {
    const item = menuItemById.get(menuItemId)
    return item ? parseMoney(item.price) : null
  }

  const weekdayLabels = useMemo(() => weekdayNames(locale), [locale])

  // Deal pricing preview: highest-priced allowed options (same rule as the server).
  const comboNormalTotal = useMemo(() => {
    if (kind !== 'COMBO') return null
    if (form.comboRows.some((r) => !r.menuItemId)) return null
    return comboHighestNormalTotal(
      form.comboRows.map((r) => ({
        menuItemId: r.menuItemId,
        quantity: Number.parseInt(r.quantity, 10),
        variantOptionIds: r.restrictVariants ? r.variantOptionIds : [],
      })),
      menuItemById,
    )
  }, [kind, form.comboRows, menuItemById])

  const comboPriceNum =
    form.comboPrice.trim() && MONEY_RE.test(form.comboPrice.trim())
      ? parseMoney(form.comboPrice)
      : null
  const comboNotCheaper =
    comboNormalTotal != null &&
    comboPriceNum != null &&
    comboPriceNum > 0 &&
    comboPriceNum >= comboNormalTotal

  // Fixed discount larger than an item's price → that item becomes free.
  const fixedDiscountCoversPrice = useMemo(() => {
    if (kind !== 'DISCOUNT' || form.discountType !== 'FIXED_AMOUNT') return false
    const v = form.discountValue.trim()
    if (!v || !MONEY_RE.test(v)) return false
    const value = parseMoney(v)
    if (value <= 0) return false
    if (form.appliesToAllItems) {
      return (menuItemsQuery.data ?? []).some(
        (item) => parseMoney(item.price) <= value,
      )
    }
    return form.targetRows.some((r) => {
      const price = r.menuItemId ? menuItemPrice(r.menuItemId) : null
      return price != null && price <= value
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- menuItemById drives menuItemPrice
  }, [
    kind,
    form.discountType,
    form.discountValue,
    form.appliesToAllItems,
    form.targetRows,
    menuItemsQuery.data,
    menuItemById,
  ])

  // ─── Body + validation ────────────────────────────────────────────────

  /** @param {string} v */
  function limitOrNull(v) {
    const s = v.trim()
    return s ? Number.parseInt(s, 10) : null
  }

  /**
   * @param {OfferItemRow[]} rows
   * @param {'TARGET' | 'BUY' | 'GET' | 'COMBO_ITEM'} role
   */
  function itemsBody(rows, role) {
    return rows.map((r) => ({
      role,
      menuItemId: r.menuItemId,
      quantity: role === 'TARGET' ? 1 : Number.parseInt(r.quantity, 10),
      ...(role === 'GET' ? { discountPercent: r.discountPercent.trim() } : {}),
      variantOptionIds: r.restrictVariants ? [...r.variantOptionIds] : [],
    }))
  }

  function buildBody() {
    /** @type {Record<string, unknown>} */
    const body = {
      nameAr: form.nameAr.trim(),
      nameEn: form.nameEn.trim() || null,
      kind,
      discountType: kind === 'DISCOUNT' ? form.discountType : null,
      discountValue: kind === 'DISCOUNT' ? form.discountValue.trim() : null,
      appliesToAllItems: kind === 'DISCOUNT' ? form.appliesToAllItems : false,
      comboPrice: kind === 'COMBO' ? form.comboPrice.trim() : null,
      startsAt: riyadhInputToIso(form.startsAt),
      endsAt: riyadhInputToIso(form.endsAt),
      dailyStartTime: form.dailyStartTime || null,
      dailyEndTime: form.dailyEndTime || null,
      weekdays: [...form.weekdays].sort((a, b) => a - b),
      totalUsageLimit: limitOrNull(form.totalUsageLimit),
      dailyUsageLimit: limitOrNull(form.dailyUsageLimit),
      maxPerOrder: limitOrNull(form.maxPerOrder),
      active: form.active,
      sortOrder: typeof offer?.sortOrder === 'number' ? offer.sortOrder : 0,
      items: [],
    }
    if (kind === 'DISCOUNT' && !form.appliesToAllItems) {
      body.items = itemsBody(form.targetRows, 'TARGET')
    } else if (kind === 'BUY_X_GET_Y') {
      body.items = [
        ...itemsBody(form.buyRows, 'BUY'),
        ...itemsBody(form.getRows, 'GET'),
      ]
    } else if (kind === 'COMBO') {
      body.items = itemsBody(form.comboRows, 'COMBO_ITEM')
    }
    if (bannerNext === 'clear') body.clearBanner = true
    else if (bannerNext && typeof bannerNext === 'object') {
      body.bannerBase64 = bannerNext.base64
      body.bannerMimeType = bannerNext.mime
    }
    if (imageNext === 'clear') body.clearImage = true
    else if (imageNext && typeof imageNext === 'object') {
      body.imageBase64 = imageNext.base64
      body.imageMimeType = imageNext.mime
    }
    return body
  }

  /**
   * @param {OfferItemRow[]} rows
   * @param {Record<string, string>} errors
   * @param {{ qty: boolean, percent: boolean }} opts
   */
  function validateRows(rows, errors, opts) {
    for (const r of rows) {
      if (!r.menuItemId) {
        errors[`row-menu-${r.clientId}`] = t('validationMenuItem')
      } else if (
        inactiveSavedItems.has(r.menuItemId) &&
        !menuItemById.has(r.menuItemId) &&
        menuItemsQuery.isSuccess
      ) {
        errors[`row-menu-${r.clientId}`] = t('validationItemTurnedOff')
      }
      if (opts.qty) {
        const q = r.quantity.trim()
        const n = Number.parseInt(q, 10)
        if (!INT_RE.test(q) || n < 1 || n > MAX_QTY) {
          errors[`row-qty-${r.clientId}`] = t('validationQty', { max: MAX_QTY })
        }
      }
      if (opts.percent) {
        const p = r.discountPercent.trim()
        const n = parseMoney(p)
        if (!MONEY_RE.test(p) || n <= 0 || n > 100) {
          errors[`row-pct-${r.clientId}`] = t('validationPercent')
        }
      }
      if (
        r.restrictVariants &&
        r.menuItemId &&
        variantGroupsForItem(r.menuItemId).length > 0 &&
        r.variantOptionIds.length === 0
      ) {
        errors[`row-variants-${r.clientId}`] = t('validationVariantPick')
      }
    }
  }

  /** @param {string} key @param {string} value @param {Record<string, string>} errors */
  function validateLimit(key, value, errors) {
    const s = value.trim()
    if (!s) return
    const n = Number.parseInt(s, 10)
    if (!INT_RE.test(s) || n < 1 || n > MAX_LIMIT) {
      errors[key] = t('validationLimit')
    }
  }

  function validate() {
    /** @type {Record<string, string>} */
    const errors = {}
    if (!form.nameAr.trim()) errors.nameAr = t('validationNameAr')

    if (kind === 'DISCOUNT') {
      const v = form.discountValue.trim()
      const n = parseMoney(v)
      if (!v || !MONEY_RE.test(v) || n <= 0) {
        errors.discountValue =
          form.discountType === 'PERCENTAGE'
            ? t('validationPercent')
            : t('validationAmount')
      } else if (form.discountType === 'PERCENTAGE' && n > 100) {
        errors.discountValue = t('validationPercent')
      }
      if (!form.appliesToAllItems) {
        if (form.targetRows.length === 0) {
          errors.targetRows = tErr('OFFER_TARGET_ITEMS_REQUIRED')
        }
        validateRows(form.targetRows, errors, { qty: false, percent: false })
      }
    }

    if (kind === 'BUY_X_GET_Y') {
      if (form.buyRows.length === 0 || form.getRows.length === 0) {
        errors.buyRows = tErr('OFFER_BUY_GET_REQUIRED')
      }
      validateRows(form.buyRows, errors, { qty: true, percent: false })
      validateRows(form.getRows, errors, { qty: true, percent: true })
    }

    if (kind === 'COMBO') {
      if (
        form.comboRows.length < COMBO_MIN_ITEMS ||
        form.comboRows.length > COMBO_MAX_ITEMS
      ) {
        errors.comboRows = tErr('OFFER_COMBO_ITEMS_RANGE')
      }
      validateRows(form.comboRows, errors, { qty: true, percent: false })
      const p = form.comboPrice.trim()
      if (!p || !MONEY_RE.test(p) || parseMoney(p) <= 0) {
        errors.comboPrice = t('validationComboPrice')
      }
    }

    const startIso = riyadhInputToIso(form.startsAt)
    const endIso = riyadhInputToIso(form.endsAt)
    if (form.startsAt && !startIso) errors.startsAt = t('validationDateTime')
    if (form.endsAt && !endIso) errors.endsAt = t('validationDateTime')
    if (startIso && endIso && new Date(endIso) <= new Date(startIso)) {
      errors.endsAt = tErr('OFFER_DATE_RANGE_INVALID')
    }

    const ds = form.dailyStartTime
    const de = form.dailyEndTime
    if (ds || de) {
      if (!ds || !TIME_RE.test(ds)) {
        errors.dailyStartTime = t('validationTimeBoth')
      }
      if (!de || !TIME_RE.test(de)) {
        errors.dailyEndTime = t('validationTimeBoth')
      } else if (ds && ds === de) {
        errors.dailyEndTime = t('validationTimeSame')
      }
    }

    validateLimit('totalUsageLimit', form.totalUsageLimit, errors)
    validateLimit('dailyUsageLimit', form.dailyUsageLimit, errors)
    validateLimit('maxPerOrder', form.maxPerOrder, errors)

    return errors
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = buildBody()
      if (mode === 'edit' && offerId) {
        return authPatch(`/offers/${offerId}`, body)
      }
      return authPost('/offers', body)
    },
    onSuccess: () => {
      toast.success(t('formSaved'))
      setSaved(true)
      allowNextNavigation()
      const target = pendingLeaveRef.current
      pendingLeaveRef.current = null
      setLeaveModalOpen(false)
      if (target) {
        proceedLeave(target)
        return
      }
      router.push('/offers')
      router.refresh()
    },
    onError: (err) => {
      pendingLeaveRef.current = null
      const code = err instanceof AuthApiError ? err.code : undefined
      const message =
        code && tErr.has(code) ? tErr(code) : tErr('generic')
      toastAuthApiError(tErr, err)
      /** @type {string} */
      let field = code && OFFER_ERROR_FIELD_MAP[code] ? OFFER_ERROR_FIELD_MAP[code] : ''
      if (code === 'OFFER_DISCOUNT_VALUE_INVALID' && kind !== 'DISCOUNT') field = ''
      if (code === 'OFFER_PERCENT_OUT_OF_RANGE') {
        field = kind === 'DISCOUNT' ? 'discountValue' : 'getRows'
      }
      if (field) {
        setFieldErrors((prev) => ({ ...prev, [field]: message }))
      } else {
        // Not tied to one field (e.g. an item was turned off) — keep it visible.
        setFormError(message)
      }
      scrollAfterFieldValidation()
    },
  })

  function runSave() {
    setFormError('')
    const errors = validate()
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      scrollAfterFieldValidation()
      return false
    }
    setFieldErrors({})
    saveMutation.mutate()
    return true
  }

  /** @param {import('react').FormEvent} e */
  function handleSave(e) {
    e.preventDefault()
    // A normal save goes back to the list, never to an earlier blocked link.
    pendingLeaveRef.current = null
    runSave()
  }

  function handleClose() {
    if (isDirty) {
      pendingLeaveRef.current = { kind: 'href', href: `/${locale}/offers` }
      setLeaveModalOpen(true)
      return
    }
    router.push('/offers')
  }

  function handleLeaveDontSave() {
    const target = pendingLeaveRef.current
    pendingLeaveRef.current = null
    setLeaveModalOpen(false)
    if (target) proceedLeave(target)
  }

  function handleLeaveSave() {
    setLeaveModalOpen(false)
    if (currentStep !== 2) {
      pendingLeaveRef.current = null
      setCurrentStep(2)
      return
    }
    if (!runSave()) pendingLeaveRef.current = null
  }

  // ─── Row editing ──────────────────────────────────────────────────────

  /**
   * @param {'targetRows' | 'buyRows' | 'getRows' | 'comboRows'} key
   * @param {string} clientId
   * @param {Partial<OfferItemRow>} patch
   */
  function patchRow(key, clientId, patch) {
    setForm((prev) => ({
      ...prev,
      [key]: prev[key].map((r) =>
        r.clientId === clientId ? { ...r, ...patch } : r,
      ),
    }))
  }

  /**
   * @param {OfferItemRow} row
   * @param {'targetRows' | 'buyRows' | 'getRows' | 'comboRows'} key
   * @param {boolean} isDeal
   */
  function renderVariantChoice(row, key, isDeal) {
    if (!row.menuItemId) return null
    const groups = variantGroupsForItem(row.menuItemId)
    if (groups.length === 0) return null
    const selected = new Set(row.variantOptionIds)
    const err = fieldErrors[`row-variants-${row.clientId}`]
    return (
      <fieldset className="space-y-hisabi-md">
        <legend className={cn(LABEL_CLASS, 'mb-hisabi-sm', alignDoc)}>
          {t('variantLegend')}
        </legend>
        <div className={cn(SEGMENT_SHELL, 'max-w-xl')}>
          {(
            /** @type {const} */ ([
              [false, isDeal ? 'variantAnyDeal' : 'variantAny'],
              [true, 'variantRestrict'],
            ])
          ).map(([value, labelKey]) => (
            <button
              key={String(value)}
              type="button"
              aria-pressed={row.restrictVariants === value}
              onClick={() => {
                patchRow(key, row.clientId, {
                  restrictVariants: value,
                  variantOptionIds: value ? row.variantOptionIds : [],
                })
                clearFieldError(`row-variants-${row.clientId}`)
              }}
              className={segmentOptionClass(row.restrictVariants === value)}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
        <p className={HINT_CLASS}>
          {row.restrictVariants
            ? t('variantRestrictHint')
            : isDeal
              ? t('variantAnyDealHint')
              : t('variantAnyHint')}
        </p>
        {row.restrictVariants
          ? groups.map((group) => (
              <div key={group.id} className="space-y-hisabi-xs">
                <p className="type-label-md font-semibold text-hisabi-on-surface">
                  {bilingualLabel(group)}
                </p>
                <div className="flex flex-wrap gap-hisabi-sm">
                  {group.options.map((opt) => {
                    const checked = selected.has(opt.id)
                    return (
                      <label
                        key={opt.id}
                        className={cn(
                          'type-body-sm flex cursor-pointer items-center gap-hisabi-sm rounded-lg border px-hisabi-md py-2 transition-colors',
                          checked
                            ? 'border-hisabi-primary bg-hisabi-primary/5 text-hisabi-on-surface'
                            : 'border-hisabi-outline-variant text-hisabi-on-surface-variant hover:bg-hisabi-surface-container',
                        )}
                      >
                        <input
                          type="checkbox"
                          className="size-4 accent-hisabi-primary"
                          checked={checked}
                          onChange={() => {
                            patchRow(key, row.clientId, {
                              variantOptionIds: checked
                                ? row.variantOptionIds.filter((id) => id !== opt.id)
                                : [...row.variantOptionIds, opt.id],
                            })
                            clearFieldError(`row-variants-${row.clientId}`)
                          }}
                        />
                        {bilingualLabel(opt)}
                      </label>
                    )
                  })}
                </div>
              </div>
            ))
          : null}
        {err ? (
          <p className="type-body-sm text-hisabi-error" role="alert">
            {err}
          </p>
        ) : null}
      </fieldset>
    )
  }

  /**
   * @param {{
   *   key: 'targetRows' | 'buyRows' | 'getRows' | 'comboRows'
   *   role: 'TARGET' | 'BUY' | 'GET' | 'COMBO_ITEM'
   *   showQty: boolean
   *   showPercent: boolean
   *   minRows: number
   *   maxRows: number
   *   addLabel: string
   *   rowTitleKey: string
   * }} cfg
   */
  function renderRows(cfg) {
    const rows = form[cfg.key]
    const isDeal = cfg.role === 'COMBO_ITEM'
    return (
      <div className="space-y-hisabi-md">
        {rows.map((row, index) => {
          const menuErr = fieldErrors[`row-menu-${row.clientId}`]
          const qtyErr = fieldErrors[`row-qty-${row.clientId}`]
          const pctErr = fieldErrors[`row-pct-${row.clientId}`]
          const price = row.menuItemId ? menuItemPrice(row.menuItemId) : null
          return (
            <div
              key={row.clientId}
              className="space-y-hisabi-md rounded-lg border border-hisabi-outline-variant bg-white p-hisabi-md"
            >
              <div className="flex items-center justify-between gap-hisabi-sm">
                <p className="type-label-md font-bold text-hisabi-on-surface">
                  {t(cfg.rowTitleKey, { n: index + 1 })}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      [cfg.key]: prev[cfg.key].filter(
                        (r) => r.clientId !== row.clientId,
                      ),
                    }))
                  }
                  className="text-hisabi-error hover:bg-hisabi-error/8 flex size-8 cursor-pointer items-center justify-center rounded-lg disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={t('removeItem')}
                  title={t('removeItem')}
                  disabled={rows.length <= cfg.minRows}
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>
              <div
                className={cn(
                  'grid gap-hisabi-md',
                  cfg.showQty && cfg.showPercent
                    ? 'sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]'
                    : cfg.showQty
                      ? 'sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]'
                      : '',
                )}
              >
                <div className="min-w-0 space-y-hisabi-xs">
                  <label className={LABEL_CLASS}>
                    {t('fieldMenuItem')}
                    <RequiredMark />
                  </label>
                  <SearchableEntityPicker
                    items={menuPickerItems}
                    loading={menuItemsQuery.isPending}
                    value={row.menuItemId}
                    onChange={(id) => {
                      patchRow(cfg.key, row.clientId, {
                        menuItemId: id,
                        restrictVariants: false,
                        variantOptionIds: [],
                      })
                      clearFieldError(`row-menu-${row.clientId}`)
                      clearFieldError(`row-variants-${row.clientId}`)
                    }}
                    emptyLabel={t('selectMenuItem')}
                    searchPlaceholder={t('searchMenuItems')}
                    triggerClassName={cn(fieldClass, menuErr && fieldInvalidClass)}
                  />
                  {price != null && !menuErr ? (
                    <p className={HINT_CLASS}>
                      {t('itemNormalPrice', {
                        price: decimalStringFromNumber(price),
                      })}
                    </p>
                  ) : null}
                  {menuErr ? (
                    <p className="type-body-sm text-hisabi-error" role="alert">
                      {menuErr}
                    </p>
                  ) : null}
                </div>
                {cfg.showQty ? (
                  <div className="min-w-0 space-y-hisabi-xs">
                    <label className={LABEL_CLASS}>
                      {t('fieldQuantity')}
                      <RequiredMark />
                    </label>
                    <input
                      className={cn(fieldClass, qtyErr && fieldInvalidClass)}
                      dir="ltr"
                      inputMode="numeric"
                      value={row.quantity}
                      placeholder={t('quantityPlaceholder')}
                      aria-invalid={qtyErr ? true : undefined}
                      onChange={(e) => {
                        patchRow(cfg.key, row.clientId, {
                          quantity: e.target.value.replace(/[^\d]/g, ''),
                        })
                        clearFieldError(`row-qty-${row.clientId}`)
                      }}
                    />
                    {qtyErr ? (
                      <p className="type-body-sm text-hisabi-error" role="alert">
                        {qtyErr}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {cfg.showPercent ? (
                  <div className="min-w-0 space-y-hisabi-xs">
                    <label className={LABEL_CLASS}>
                      {t('fieldGetPercent')}
                      <RequiredMark />
                    </label>
                    <div className="relative">
                      <input
                        className={cn(
                          fieldClass,
                          'pe-10',
                          pctErr && fieldInvalidClass,
                        )}
                        dir="ltr"
                        inputMode="decimal"
                        value={row.discountPercent}
                        placeholder={t('getPercentPlaceholder')}
                        aria-invalid={pctErr ? true : undefined}
                        onChange={(e) => {
                          patchRow(cfg.key, row.clientId, {
                            discountPercent: e.target.value,
                          })
                          clearFieldError(`row-pct-${row.clientId}`)
                        }}
                      />
                      <span
                        className="type-label-md text-hisabi-on-surface-variant pointer-events-none absolute inset-y-0 end-0 flex items-center pe-hisabi-md"
                        aria-hidden
                      >
                        %
                      </span>
                    </div>
                    <p className={HINT_CLASS}>{t('getPercentHint')}</p>
                    {pctErr ? (
                      <p className="type-body-sm text-hisabi-error" role="alert">
                        {pctErr}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {renderVariantChoice(row, cfg.key, isDeal)}
            </div>
          )
        })}
        {rows.length < cfg.maxRows ? (
          <button
            type="button"
            onClick={() =>
              setForm((prev) => ({
                ...prev,
                [cfg.key]: [...prev[cfg.key], emptyRow(cfg.role)],
              }))
            }
            className="type-label-sm inline-flex cursor-pointer items-center gap-1 font-semibold text-hisabi-secondary hover:underline"
          >
            <Plus className="size-4 shrink-0" aria-hidden />
            {cfg.addLabel}
          </button>
        ) : null}
      </div>
    )
  }

  /**
   * @param {{ id: string, key: 'startsAt' | 'endsAt' | 'dailyStartTime' | 'dailyEndTime' | 'totalUsageLimit' | 'dailyUsageLimit' | 'maxPerOrder', label: string, placeholder: string, hint?: string, type?: string, inputMode?: 'numeric' }} cfg
   */
  function renderSimpleField(cfg) {
    const err = fieldErrors[cfg.key]
    return (
      <div className="min-w-0 space-y-hisabi-xs">
        <label htmlFor={cfg.id} className={cn(LABEL_CLASS, alignDoc)}>
          {cfg.label}
        </label>
        <input
          id={cfg.id}
          type={cfg.type ?? 'text'}
          className={cn(fieldClass, err && fieldInvalidClass)}
          dir="ltr"
          inputMode={cfg.inputMode}
          value={form[cfg.key]}
          placeholder={cfg.placeholder}
          aria-invalid={err ? true : undefined}
          onChange={(e) => {
            const raw = e.target.value
            patchForm({
              [cfg.key]:
                cfg.inputMode === 'numeric' ? raw.replace(/[^\d]/g, '') : raw,
            })
            clearFieldError(cfg.key)
            if (cfg.key === 'startsAt') clearFieldError('endsAt')
            if (cfg.key === 'dailyStartTime') clearFieldError('dailyEndTime')
            if (cfg.key === 'dailyEndTime') clearFieldError('dailyStartTime')
          }}
        />
        {cfg.hint ? <p className={HINT_CLASS}>{cfg.hint}</p> : null}
        {err ? (
          <p className="type-body-sm text-hisabi-error" role="alert">
            {err}
          </p>
        ) : null}
      </div>
    )
  }

  const kindCards =
    /** @type {const} */ ([
      { value: 'DISCOUNT', labelKey: 'kindDiscount', descKey: 'kindDiscountDesc', Icon: BadgePercent },
      { value: 'BUY_X_GET_Y', labelKey: 'kindBuyXGetY', descKey: 'kindBuyXGetYDesc', Icon: Gift },
      { value: 'COMBO', labelKey: 'kindCombo', descKey: 'kindComboDesc', Icon: Package },
    ])

  const kindLabelKey =
    kind === 'DISCOUNT'
      ? 'kindDiscount'
      : kind === 'BUY_X_GET_Y'
        ? 'kindBuyXGetY'
        : kind === 'COMBO'
          ? 'kindCombo'
          : null

  const limitKeySuffix =
    kind === 'COMBO' ? 'Combo' : kind === 'BUY_X_GET_Y' ? 'Bxgy' : 'Discount'

  const saving = saveMutation.isPending

  return (
    <div className="min-h-screen bg-transparent pb-hisabi-xxl">
      <div className="mx-auto w-full max-w-hisabi-container px-hisabi-md pt-hisabi-md sm:px-hisabi-xl">
        <PageBackButton href="/offers" label={t('formBackToList')} />
        <h1
          id={titleId}
          className={cn(
            'type-headline-xl text-hisabi-on-surface tracking-tight',
            alignDoc,
          )}
        >
          {mode === 'edit' ? t('formEditTitle') : t('formNewTitle')}
        </h1>
        <p
          className={cn(
            'type-body-md text-hisabi-on-surface-variant mt-0.5 mb-hisabi-xl max-w-2xl',
            alignDoc,
          )}
        >
          {mode === 'edit' ? t('formEditSubtitle') : t('formNewSubtitle')}
        </p>
      </div>

      <div
        className="mx-auto w-full max-w-hisabi-container space-y-hisabi-xl px-hisabi-md sm:px-hisabi-xl"
        aria-labelledby={titleId}
      >
        {mode === 'create' ? (
          <div
            className="flex w-full max-w-md rounded-lg border border-hisabi-outline-variant/60 bg-white p-1"
            role="tablist"
            aria-label={t('formStepsAria')}
          >
            <button
              type="button"
              role="tab"
              aria-selected={currentStep === 1}
              onClick={() => setCurrentStep(1)}
              className={segmentOptionClass(currentStep === 1)}
            >
              {t('formStepType')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={currentStep === 2}
              disabled={!kindReady}
              onClick={() => {
                if (kindReady) setCurrentStep(2)
              }}
              className={cn(
                segmentOptionClass(currentStep === 2),
                !kindReady && 'cursor-not-allowed opacity-50 hover:bg-transparent',
              )}
            >
              {t('formStepDetails')}
            </button>
          </div>
        ) : null}

        {currentStep === 1 && mode === 'create' ? (
          <>
            <SettingsSection title={t('sectionType')} icon={Shapes}>
              <fieldset className="space-y-hisabi-md">
                <legend className={cn(LABEL_CLASS, 'mb-hisabi-sm', alignDoc)}>
                  {t('typeLegend')}
                  <RequiredMark />
                </legend>
                <div className={cn(SEGMENT_SHELL, 'grid grid-cols-1 gap-1 md:grid-cols-3')}>
                  {kindCards.map((opt) => {
                    const selected = kind === opt.value
                    const Icon = opt.Icon
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => patchForm({ kind: opt.value })}
                        className={cn(
                          segmentOptionClass(selected),
                          'flex-col items-start gap-hisabi-xs px-hisabi-md py-hisabi-md text-start',
                        )}
                      >
                        <span className="flex items-center gap-hisabi-sm font-bold">
                          <Icon className="size-5 shrink-0" aria-hidden />
                          {t(opt.labelKey)}
                        </span>
                        <span
                          className={cn(
                            'type-body-sm font-medium',
                            selected ? 'text-white/90' : 'text-hisabi-on-surface-variant',
                          )}
                        >
                          {t(opt.descKey)}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </fieldset>
            </SettingsSection>

            <div className={FORM_FOOTER_CLASS}>
              <button type="button" onClick={handleClose} className={SECONDARY_BTN_CLASS}>
                {t('cancel')}
              </button>
              <AuthSubmitButton
                type="button"
                variant="gold"
                disabled={!kindReady}
                onClick={() => {
                  if (kindReady) setCurrentStep(2)
                }}
                className="min-h-0 w-full min-w-0 py-4 min-[500px]:w-auto min-[500px]:min-w-[12rem]"
              >
                {t('formNext')}
              </AuthSubmitButton>
            </div>
          </>
        ) : null}

        {currentStep === 2 && kindReady ? (
          <form noValidate className="flex flex-col" onSubmit={handleSave}>
            <div className="space-y-hisabi-xl">
              {formError ? (
                <p className="type-body-md text-hisabi-error" role="alert">
                  {formError}
                </p>
              ) : null}

              {/* Basics: type + names + active */}
              <SettingsSection title={t('sectionBasics')} icon={Tag}>
                <dl className="grid gap-hisabi-md sm:grid-cols-2">
                  <div>
                    <dt className="type-label-md text-hisabi-on-surface-variant">
                      {t('typeLegend')}
                    </dt>
                    <dd className="type-body-md font-semibold text-hisabi-on-surface">
                      {kindLabelKey ? t(kindLabelKey) : '—'}
                    </dd>
                  </div>
                </dl>
                {mode === 'edit' ? (
                  <p className={HINT_CLASS}>{t('typeLockedHint')}</p>
                ) : null}

                <div
                  dir="ltr"
                  className="grid grid-cols-1 gap-hisabi-lg sm:grid-cols-2"
                >
                  <div className="min-w-0 space-y-hisabi-xs text-start">
                    <label
                      htmlFor="offer-name-en"
                      className="type-label-md text-hisabi-on-surface-variant flex items-center gap-2"
                    >
                      {t('fieldNameEn')}
                      {loadingNameEn ? (
                        <HisabiSpinner
                          size="inline"
                          className="text-hisabi-teal"
                          label={tBi('translating')}
                        />
                      ) : null}
                    </label>
                    <input
                      id="offer-name-en"
                      className={fieldClass}
                      value={form.nameEn}
                      maxLength={200}
                      placeholder={t('nameEnPlaceholder')}
                      dir="ltr"
                      onChange={(e) => {
                        reportUserInput('en', NAME_PAIR_KEY, {
                          otherFieldEmpty: !form.nameAr.trim(),
                        })
                        patchForm({ nameEn: e.target.value.slice(0, 200) })
                      }}
                    />
                  </div>
                  <div className="min-w-0 space-y-hisabi-xs text-start">
                    <label
                      htmlFor="offer-name-ar"
                      className="type-label-md text-hisabi-on-surface-variant flex items-center gap-2"
                    >
                      {t('fieldNameAr')}
                      <RequiredMark />
                      {loadingNameAr ? (
                        <HisabiSpinner
                          size="inline"
                          className="text-hisabi-teal"
                          label={tBi('translating')}
                        />
                      ) : null}
                    </label>
                    <input
                      id="offer-name-ar"
                      className={cn(fieldClass, fieldErrors.nameAr && fieldInvalidClass)}
                      value={form.nameAr}
                      maxLength={200}
                      placeholder={t('nameArPlaceholder')}
                      dir="rtl"
                      aria-invalid={fieldErrors.nameAr ? true : undefined}
                      onChange={(e) => {
                        reportUserInput('ar', NAME_PAIR_KEY, {
                          otherFieldEmpty: !form.nameEn.trim(),
                        })
                        patchForm({ nameAr: e.target.value.slice(0, 200) })
                        clearFieldError('nameAr')
                      }}
                    />
                    {fieldErrors.nameAr ? (
                      <p className="type-body-sm text-hisabi-error" role="alert">
                        {fieldErrors.nameAr}
                      </p>
                    ) : null}
                  </div>
                </div>
                <p className={HINT_CLASS}>{t('nameHint')}</p>

                <fieldset className="min-w-0 space-y-hisabi-xs">
                  <legend className={cn(LABEL_CLASS, alignDoc)}>
                    {t('fieldActive')}
                  </legend>
                  <div className={cn(SEGMENT_SHELL, 'max-w-sm')}>
                    {(
                      /** @type {const} */ ([
                        [true, 'activeOn'],
                        [false, 'activeOff'],
                      ])
                    ).map(([value, labelKey]) => (
                      <button
                        key={String(value)}
                        type="button"
                        aria-pressed={form.active === value}
                        onClick={() => patchForm({ active: value })}
                        className={segmentOptionClass(form.active === value)}
                      >
                        {t(labelKey)}
                      </button>
                    ))}
                  </div>
                  <p className={HINT_CLASS}>{t('activeHint')}</p>
                </fieldset>
              </SettingsSection>

              {/* Type-specific */}
              {kind === 'DISCOUNT' ? (
                <SettingsSection title={t('sectionDiscount')} icon={BadgePercent}>
                  <div className="grid gap-hisabi-lg sm:grid-cols-2">
                    <fieldset className="min-w-0 space-y-hisabi-xs">
                      <legend className={cn(LABEL_CLASS, 'mb-hisabi-sm', alignDoc)}>
                        {t('fieldDiscountType')}
                        <RequiredMark />
                      </legend>
                      <div className={SEGMENT_SHELL}>
                        {(
                          /** @type {const} */ ([
                            ['PERCENTAGE', 'discountTypePercent'],
                            ['FIXED_AMOUNT', 'discountTypeFixed'],
                          ])
                        ).map(([value, labelKey]) => (
                          <button
                            key={value}
                            type="button"
                            aria-pressed={form.discountType === value}
                            onClick={() => {
                              patchForm({ discountType: value })
                              clearFieldError('discountValue')
                              clearFieldError('discountType')
                            }}
                            className={segmentOptionClass(form.discountType === value)}
                          >
                            {t(labelKey)}
                          </button>
                        ))}
                      </div>
                      {fieldErrors.discountType ? (
                        <p className="type-body-sm text-hisabi-error" role="alert">
                          {fieldErrors.discountType}
                        </p>
                      ) : null}
                    </fieldset>
                    <div className="min-w-0 space-y-hisabi-xs">
                      <label htmlFor="offer-discount-value" className={cn(LABEL_CLASS, alignDoc)}>
                        {form.discountType === 'PERCENTAGE'
                          ? t('fieldDiscountPercent')
                          : t('fieldDiscountAmount')}
                        <RequiredMark />
                      </label>
                      <div className="relative">
                        <input
                          id="offer-discount-value"
                          className={cn(
                            fieldClass,
                            'pe-14',
                            fieldErrors.discountValue && fieldInvalidClass,
                          )}
                          dir="ltr"
                          inputMode="decimal"
                          value={form.discountValue}
                          placeholder={
                            form.discountType === 'PERCENTAGE'
                              ? t('discountPercentPlaceholder')
                              : t('discountAmountPlaceholder')
                          }
                          aria-invalid={fieldErrors.discountValue ? true : undefined}
                          onChange={(e) => {
                            patchForm({ discountValue: e.target.value })
                            clearFieldError('discountValue')
                          }}
                        />
                        <span
                          className="type-label-md text-hisabi-on-surface-variant pointer-events-none absolute inset-y-0 end-0 flex items-center pe-hisabi-md"
                          aria-hidden
                        >
                          {form.discountType === 'PERCENTAGE' ? '%' : t('currency')}
                        </span>
                      </div>
                      <p className={HINT_CLASS}>
                        {form.discountType === 'PERCENTAGE'
                          ? t('discountPercentHint')
                          : t('discountAmountHint')}
                      </p>
                      {fieldErrors.discountValue ? (
                        <p className="type-body-sm text-hisabi-error" role="alert">
                          {fieldErrors.discountValue}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {fixedDiscountCoversPrice ? (
                    <p
                      className="type-body-sm flex items-start gap-hisabi-sm rounded-lg border border-hisabi-secondary/30 bg-hisabi-secondary-container/40 px-hisabi-md py-hisabi-sm text-hisabi-on-surface"
                      role="status"
                    >
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-hisabi-secondary" aria-hidden />
                      {t('fixedCoversPriceWarning')}
                    </p>
                  ) : null}

                  <fieldset className="min-w-0 space-y-hisabi-xs">
                    <legend className={cn(LABEL_CLASS, 'mb-hisabi-sm', alignDoc)}>
                      {t('fieldAppliesTo')}
                      <RequiredMark />
                    </legend>
                    <div className={cn(SEGMENT_SHELL, 'max-w-xl')}>
                      {(
                        /** @type {const} */ ([
                          [true, 'appliesAll'],
                          [false, 'appliesSelected'],
                        ])
                      ).map(([value, labelKey]) => (
                        <button
                          key={String(value)}
                          type="button"
                          aria-pressed={form.appliesToAllItems === value}
                          onClick={() => {
                            patchForm({ appliesToAllItems: value })
                            clearFieldError('targetRows')
                          }}
                          className={segmentOptionClass(form.appliesToAllItems === value)}
                        >
                          {t(labelKey)}
                        </button>
                      ))}
                    </div>
                    <p className={HINT_CLASS}>
                      {form.appliesToAllItems ? t('appliesAllHint') : t('appliesSelectedHint')}
                    </p>
                  </fieldset>

                  {!form.appliesToAllItems ? (
                    <div className="space-y-hisabi-md">
                      {fieldErrors.targetRows ? (
                        <p className="type-body-sm text-hisabi-error" role="alert">
                          {fieldErrors.targetRows}
                        </p>
                      ) : null}
                      {renderRows({
                        key: 'targetRows',
                        role: 'TARGET',
                        showQty: false,
                        showPercent: false,
                        minRows: 1,
                        maxRows: 40,
                        addLabel: t('addDiscountItem'),
                        rowTitleKey: 'rowItemTitle',
                      })}
                    </div>
                  ) : null}
                </SettingsSection>
              ) : null}

              {kind === 'BUY_X_GET_Y' ? (
                <SettingsSection title={t('sectionBxgy')} icon={Gift}>
                  <p className={HINT_CLASS}>{t('bxgyIntro')}</p>
                  {fieldErrors.buyRows ? (
                    <p className="type-body-sm text-hisabi-error" role="alert">
                      {fieldErrors.buyRows}
                    </p>
                  ) : null}
                  <div className="space-y-hisabi-md">
                    <h3 className="type-label-md font-bold text-hisabi-on-surface">
                      {t('buyItemsTitle')}
                    </h3>
                    <p className={HINT_CLASS}>{t('buyItemsHint')}</p>
                    {renderRows({
                      key: 'buyRows',
                      role: 'BUY',
                      showQty: true,
                      showPercent: false,
                      minRows: 1,
                      maxRows: 20,
                      addLabel: t('addBuyItem'),
                      rowTitleKey: 'rowBuyTitle',
                    })}
                  </div>
                  <div className="space-y-hisabi-md">
                    <h3 className="type-label-md font-bold text-hisabi-on-surface">
                      {t('getItemsTitle')}
                    </h3>
                    <p className={HINT_CLASS}>{t('getItemsHint')}</p>
                    {fieldErrors.getRows ? (
                      <p className="type-body-sm text-hisabi-error" role="alert">
                        {fieldErrors.getRows}
                      </p>
                    ) : null}
                    {renderRows({
                      key: 'getRows',
                      role: 'GET',
                      showQty: true,
                      showPercent: true,
                      minRows: 1,
                      maxRows: 20,
                      addLabel: t('addGetItem'),
                      rowTitleKey: 'rowGetTitle',
                    })}
                  </div>
                </SettingsSection>
              ) : null}

              {kind === 'COMBO' ? (
                <SettingsSection title={t('sectionCombo')} icon={ShoppingBag}>
                  <p className={HINT_CLASS}>{t('comboIntro')}</p>
                  {fieldErrors.comboRows ? (
                    <p className="type-body-sm text-hisabi-error" role="alert">
                      {fieldErrors.comboRows}
                    </p>
                  ) : null}
                  {renderRows({
                    key: 'comboRows',
                    role: 'COMBO_ITEM',
                    showQty: true,
                    showPercent: false,
                    minRows: COMBO_MIN_ITEMS,
                    maxRows: COMBO_MAX_ITEMS,
                    addLabel: t('addComboItem'),
                    rowTitleKey: 'rowComboTitle',
                  })}

                  <div className="grid gap-hisabi-lg sm:grid-cols-2 sm:items-start">
                    <div className="min-w-0 space-y-hisabi-xs">
                      <label htmlFor="offer-combo-price" className={cn(LABEL_CLASS, alignDoc)}>
                        {t('fieldComboPrice')}
                        <RequiredMark />
                      </label>
                      <div className="relative">
                        <input
                          id="offer-combo-price"
                          className={cn(
                            fieldClass,
                            'pe-14',
                            fieldErrors.comboPrice && fieldInvalidClass,
                          )}
                          dir="ltr"
                          inputMode="decimal"
                          value={form.comboPrice}
                          placeholder={t('comboPricePlaceholder')}
                          aria-invalid={fieldErrors.comboPrice ? true : undefined}
                          onChange={(e) => {
                            patchForm({ comboPrice: e.target.value })
                            clearFieldError('comboPrice')
                          }}
                        />
                        <span
                          className="type-label-md text-hisabi-on-surface-variant pointer-events-none absolute inset-y-0 end-0 flex items-center pe-hisabi-md"
                          aria-hidden
                        >
                          {t('currency')}
                        </span>
                      </div>
                      <p className={HINT_CLASS}>{t('comboPriceHint')}</p>
                      {fieldErrors.comboPrice ? (
                        <p className="type-body-sm text-hisabi-error" role="alert">
                          {fieldErrors.comboPrice}
                        </p>
                      ) : null}
                    </div>
                    <div
                      className="space-y-hisabi-xs rounded-lg border border-hisabi-outline-variant/40 bg-hisabi-surface-container-low/50 px-hisabi-md py-hisabi-md"
                      role="status"
                    >
                      <p className="type-body-sm flex justify-between gap-hisabi-md text-hisabi-on-surface-variant">
                        <span>{t('comboNormalTotal')}</span>
                        <span className="font-semibold text-hisabi-on-surface tabular-nums" dir="ltr">
                          {comboNormalTotal != null
                            ? `${decimalStringFromNumber(comboNormalTotal)} ${t('currency')}`
                            : '—'}
                        </span>
                      </p>
                      <p className="type-body-sm flex justify-between gap-hisabi-md text-hisabi-on-surface-variant">
                        <span>{t('comboSaving')}</span>
                        <span
                          className={cn(
                            'font-semibold tabular-nums',
                            comboNotCheaper ? 'text-hisabi-error' : 'text-green-700',
                          )}
                          dir="ltr"
                        >
                          {comboNormalTotal != null && comboPriceNum != null
                            ? `${decimalStringFromNumber(Math.max(0, comboNormalTotal - comboPriceNum))} ${t('currency')}`
                            : '—'}
                        </span>
                      </p>
                      {comboNotCheaper ? (
                        <p className="type-body-sm flex items-start gap-hisabi-xs text-hisabi-error">
                          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                          {t('comboNotCheaperWarning')}
                        </p>
                      ) : (
                        <p className={HINT_CLASS}>{t('comboTotalHint')}</p>
                      )}
                    </div>
                  </div>
                </SettingsSection>
              ) : null}

              {/* Schedule */}
              <SettingsSection title={t('sectionSchedule')} icon={CalendarClock}>
                <p className={HINT_CLASS}>{t('scheduleIntro')}</p>
                <div className="grid gap-hisabi-lg sm:grid-cols-2">
                  {renderSimpleField({
                    id: 'offer-starts-at',
                    key: 'startsAt',
                    type: 'datetime-local',
                    label: t('fieldStartsAt'),
                    placeholder: t('startsAtPlaceholder'),
                    hint: t('startsAtHint'),
                  })}
                  {renderSimpleField({
                    id: 'offer-ends-at',
                    key: 'endsAt',
                    type: 'datetime-local',
                    label: t('fieldEndsAt'),
                    placeholder: t('endsAtPlaceholder'),
                    hint: t('endsAtHint'),
                  })}
                  {renderSimpleField({
                    id: 'offer-daily-start',
                    key: 'dailyStartTime',
                    type: 'time',
                    label: t('fieldDailyStart'),
                    placeholder: t('dailyStartPlaceholder'),
                  })}
                  {renderSimpleField({
                    id: 'offer-daily-end',
                    key: 'dailyEndTime',
                    type: 'time',
                    label: t('fieldDailyEnd'),
                    placeholder: t('dailyEndPlaceholder'),
                  })}
                </div>
                <p className={HINT_CLASS}>{t('dailyWindowHint')}</p>

                <fieldset className="min-w-0 space-y-hisabi-sm">
                  <legend className={cn(LABEL_CLASS, 'mb-hisabi-sm', alignDoc)}>
                    {t('fieldWeekdays')}
                  </legend>
                  <div className="flex flex-wrap gap-hisabi-sm">
                    {weekdayLabels.map((label, day) => {
                      const on = form.weekdays.includes(day)
                      return (
                        <button
                          key={day}
                          type="button"
                          aria-pressed={on}
                          onClick={() =>
                            patchForm({
                              weekdays: on
                                ? form.weekdays.filter((d) => d !== day)
                                : [...form.weekdays, day].sort((a, b) => a - b),
                            })
                          }
                          className={cn(
                            'type-label-sm offer-weekday-chip cursor-pointer rounded-full border font-bold transition-colors',
                            on
                              ? 'border-hisabi-primary-container bg-hisabi-primary-container text-white'
                              : 'border-hisabi-outline-variant bg-white text-hisabi-on-surface-variant hover:bg-hisabi-surface-container',
                          )}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                  <p className={HINT_CLASS}>
                    {form.weekdays.length === 0 ? t('weekdaysEveryDay') : t('weekdaysHint')}
                  </p>
                </fieldset>
              </SettingsSection>

              {/* Limits */}
              <SettingsSection title={t('sectionLimits')} icon={Gauge}>
                <p className={HINT_CLASS}>{t(`limitsIntro${limitKeySuffix}`)}</p>
                <div className="grid gap-hisabi-lg sm:grid-cols-3">
                  {renderSimpleField({
                    id: 'offer-total-limit',
                    key: 'totalUsageLimit',
                    inputMode: 'numeric',
                    label: t('fieldTotalLimit'),
                    placeholder: t('limitPlaceholder'),
                    hint: t(`totalLimitHint${limitKeySuffix}`),
                  })}
                  {renderSimpleField({
                    id: 'offer-daily-limit',
                    key: 'dailyUsageLimit',
                    inputMode: 'numeric',
                    label: t('fieldDailyLimit'),
                    placeholder: t('limitPlaceholder'),
                    hint: t(`dailyLimitHint${limitKeySuffix}`),
                  })}
                  {renderSimpleField({
                    id: 'offer-max-per-order',
                    key: 'maxPerOrder',
                    inputMode: 'numeric',
                    label: t(`fieldMaxPerOrder${limitKeySuffix}`),
                    placeholder: t('limitPlaceholder'),
                    hint: t(`maxPerOrderHint${limitKeySuffix}`),
                  })}
                </div>
              </SettingsSection>

              {/* Images */}
              <SettingsSection title={t('sectionImages')} icon={ImageIcon}>
                {fieldErrors.images ? (
                  <p className="type-body-sm text-hisabi-error" role="alert">
                    {fieldErrors.images}
                  </p>
                ) : null}
                <div className="grid gap-hisabi-lg md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                  <OfferImageField
                    variant="banner"
                    label={t('fieldBanner')}
                    hint={t('bannerHint')}
                    dropHint={t('bannerDropHint')}
                    existingUrl={typeof offer?.bannerUrl === 'string' ? offer.bannerUrl : null}
                    value={bannerNext}
                    disabled={saving}
                    onChange={(next) => {
                      setBannerNext(next)
                      clearFieldError('images')
                    }}
                  />
                  <OfferImageField
                    variant="product"
                    label={t('fieldProductImage')}
                    hint={kind === 'COMBO' ? t('productImageHintCombo') : t('productImageHint')}
                    dropHint={t('productImageDropHint')}
                    existingUrl={typeof offer?.imageUrl === 'string' ? offer.imageUrl : null}
                    value={imageNext}
                    disabled={saving}
                    onChange={(next) => {
                      setImageNext(next)
                      clearFieldError('images')
                    }}
                  />
                </div>
              </SettingsSection>
            </div>

            <div
              className={cn(
                FORM_FOOTER_CLASS,
                'mt-hisabi-xl',
                mode === 'create' && 'min-[500px]:justify-between',
              )}
            >
              <div className="flex w-full flex-col-reverse gap-hisabi-md min-[500px]:w-auto min-[500px]:flex-row">
                {mode === 'create' ? (
                  <button
                    type="button"
                    onClick={() => setCurrentStep(1)}
                    disabled={saving}
                    className={SECONDARY_BTN_CLASS}
                  >
                    {t('formBack')}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={saving}
                  className={SECONDARY_BTN_CLASS}
                >
                  {t('cancel')}
                </button>
              </div>
              <AuthSubmitButton
                type="submit"
                variant="gold"
                pending={saving}
                className="min-h-0 w-full min-w-0 py-4 min-[500px]:w-auto min-[500px]:min-w-[12rem]"
              >
                <span className="flex items-center justify-center gap-hisabi-sm">
                  <Save className="size-5 shrink-0" aria-hidden />
                  {saving ? t('formSaving') : t('formSave')}
                </span>
              </AuthSubmitButton>
            </div>
          </form>
        ) : null}
      </div>

      <HisabiStatusModal
        open={leaveModalOpen}
        onOpenChange={setLeaveModalOpen}
        variant="warning"
        title={t('unsavedTitle')}
        description={t('unsavedBody')}
        primaryLabel={t('unsavedSave')}
        primaryPending={saving}
        onPrimary={handleLeaveSave}
        secondaryLabel={t('unsavedDiscard')}
        onSecondary={handleLeaveDontSave}
      />
    </div>
  )
}
