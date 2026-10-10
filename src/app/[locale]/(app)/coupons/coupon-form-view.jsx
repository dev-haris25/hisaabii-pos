'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import {
  ChevronLeft,
  Hash,
  Percent,
  Plus,
  Save,
  Shapes,
  ShoppingBag,
  TicketPercent,
  Trash2,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useId, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { HisabiSpinner } from '@/components/hisabi-spinner'
import { AuthSubmitButton } from '@/components/auth/auth-submit-button'
import { useIsRtl } from '@/components/auth/use-is-rtl'
import { SearchableEntityPicker } from '@/components/invoices/searchable-entity-picker'
import { SettingsSection } from '@/components/settings/settings-page-shell'
import { RequiredMark } from '@/components/ui/required-mark'
import { useGeminiArSuggestion } from '@/hooks/use-gemini-ar-suggestion'
import { useGeminiEnSuggestion } from '@/hooks/use-gemini-en-suggestion'
import { useRouter } from '@/i18n/navigation'
import { AuthApiError, authGet, authPatch, authPost } from '@/lib/api/auth-client'
import { generateCouponCodeStringClient } from '@/lib/coupons/generate-coupon-code-string-client'
import {
  shouldEnableBilingualTranslate,
  useBilingualFieldOrigin,
} from '@/lib/i18n/use-bilingual-field-origin'
import { scrollAfterFieldValidation } from '@/lib/ui/scroll-first-invalid-field'
import { cn } from '@/lib/utils'

/** Menu Active/Inactive segment outer shell (exact class match). */
const SEGMENT_SHELL =
  'flex w-full rounded-lg border border-hisabi-outline-variant/60 bg-white p-1'

const NAME_PAIR_KEY = 'coupon.name'

/** Match Menu / Settings / Stock form fields. */
const fieldClass =
  'type-body-md text-hisabi-on-surface placeholder:text-hisabi-outline/70 w-full rounded-lg border border-hisabi-outline-variant bg-hisabi-surface-container-lowest px-hisabi-md py-3 outline-none transition-shadow focus:border-hisabi-primary focus:ring-1 focus:ring-hisabi-primary/15'
const fieldInvalidClass =
  'border-hisabi-error focus:border-hisabi-error focus:ring-hisabi-error/25'

const FORM_FOOTER_CLASS =
  'flex w-full flex-col-reverse gap-hisabi-md border-t border-hisabi-outline-variant/20 pt-hisabi-xl min-[500px]:flex-row min-[500px]:justify-end min-[500px]:gap-hisabi-xl'

const SECONDARY_BTN_CLASS =
  'type-label-md text-hisabi-primary hover:bg-hisabi-surface-container-low inline-flex min-h-[52px] w-full min-w-0 cursor-pointer items-center justify-center rounded-lg border border-hisabi-primary/20 px-hisabi-lg font-semibold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 min-[500px]:w-auto min-[500px]:min-w-[10rem]'

const MONEY_RE = /^\d+(\.\d{1,4})?$/

/** Server AuthErrors → primary form field (no shared API_FIELD_MAP in app). */
const COUPON_ERROR_FIELD_MAP = {
  COUPON_SHARED_CODE_REQUIRED: 'code',
  COUPON_SHARED_CODE_CONFLICT: 'codeMode',
  COUPON_BATCH_SIZE_REQUIRED: 'batchSize',
  COUPON_BATCH_SIZE_EXCEEDED: 'batchSize',
  COUPON_BATCH_SIZE_NOT_ALLOWED_FOR_SHARED: 'batchSize',
  COUPON_PER_CODE_USAGE_LIMIT_NOT_ALLOWED_FOR_SHARED: 'perCodeUsageLimit',
  COUPON_SHARED_CODE_NOT_ALLOWED_FOR_BATCH: 'code',
  COUPON_GENERATE_CODE_NOT_ALLOWED_FOR_BATCH: 'codeMode',
  COUPON_TOTAL_USAGE_LIMIT_NOT_ALLOWED_FOR_BATCH: 'totalUsageLimit',
  COUPON_CODE_ALREADY_EXISTS: 'code',
  COUPON_DISCOUNT_VALUE_REQUIRED: 'discountValue',
  COUPON_DISCOUNT_VALUE_NOT_ALLOWED_FOR_BOGO: 'discountValue',
  COUPON_MAX_CAP_NOT_ALLOWED_FOR_BOGO: 'maxDiscountCap',
  COUPON_COMBO_PRICE_REQUIRED: 'discountValue',
  COUPON_ITEM_RULES_NOT_ALLOWED: 'itemRules',
  COUPON_BOGO_RULES_INCOMPLETE: 'itemRulesBuy',
  COUPON_COMBO_RULES_REQUIRED: 'itemRulesCombo',
  COUPON_GET_RULE_DISCOUNT_PERCENT_REQUIRED: 'itemRulesGet',
  // TYPE_MISMATCH / MENU_ITEM_NOT_FOUND: row-targeted via details.issues when present
  COUPON_EXPIRES_BEFORE_START: 'expiresAt',
  COUPON_STRUCTURAL_FIELD_LOCKED: 'form',
  VALIDATION_ERROR: 'form',
}

/**
 * Read itemRules row index from API details (Hisabi-style `details.issues`
 * path `['itemRules', index, …]`, or flat `{ ruleIndex }`).
 * @param {unknown} details
 * @returns {number | null}
 */
function readItemRuleIndexFromDetails(details) {
  if (details == null) return null
  if (typeof details === 'object' && !Array.isArray(details)) {
    const flat = /** @type {{ ruleIndex?: unknown, issues?: unknown }} */ (
      details
    )
    if (typeof flat.ruleIndex === 'number' && Number.isFinite(flat.ruleIndex)) {
      return flat.ruleIndex
    }
    if (Array.isArray(flat.issues)) {
      for (const raw of flat.issues) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
        const path = /** @type {{ path?: unknown }} */ (raw).path
        if (
          Array.isArray(path) &&
          path[0] === 'itemRules' &&
          typeof path[1] === 'number'
        ) {
          return path[1]
        }
      }
    }
  }
  if (Array.isArray(details)) {
    for (const raw of details) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
      const path = /** @type {{ path?: unknown }} */ (raw).path
      if (
        Array.isArray(path) &&
        path[0] === 'itemRules' &&
        typeof path[1] === 'number'
      ) {
        return path[1]
      }
    }
  }
  return null
}

function segmentOptionClass(selected) {
  return cn(
    'type-label-sm flex min-w-0 flex-1 cursor-pointer items-center justify-center rounded-lg px-2 py-2.5 text-center font-bold transition-colors',
    selected
      ? 'bg-hisabi-primary-container text-white'
      : 'text-hisabi-on-surface-variant hover:bg-hisabi-surface-container',
  )
}

function newClientId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function emptyItemRule(ruleType) {
  return {
    clientId: newClientId(),
    ruleType,
    menuItemId: '',
    quantity: '1',
    discountPercent: ruleType === 'GET' ? '100' : '',
    variantOptionIds: /** @type {string[]} */ ([]),
  }
}

/**
 * @param {unknown} iso
 * @returns {string}
 */
function isoToDateInput(iso) {
  if (typeof iso !== 'string' || !iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * @param {unknown} rules
 * @param {'BUY' | 'GET' | 'COMBO_ITEM'} ruleType
 */
function rulesFromCoupon(rules, ruleType) {
  if (!Array.isArray(rules)) return []
  return rules
    .filter((r) => r && r.ruleType === ruleType)
    .map((r) => ({
      clientId: typeof r.id === 'string' ? r.id : newClientId(),
      ruleType,
      menuItemId: typeof r.menuItemId === 'string' ? r.menuItemId : '',
      quantity: String(r.quantity ?? 1),
      discountPercent:
        r.discountPercent != null && r.discountPercent !== ''
          ? String(r.discountPercent)
          : ruleType === 'GET'
            ? ''
            : '',
      variantOptionIds: Array.isArray(r.variantOptionIds)
        ? r.variantOptionIds.filter((id) => typeof id === 'string' && id)
        : [],
    }))
}

/**
 * @typedef {'SHARED' | 'UNIQUE_BATCH'} CouponCodeTypeChoice
 * @typedef {'PERCENTAGE' | 'FIXED_AMOUNT' | 'BOGO' | 'COMBO'} CouponDiscountKindChoice
 */

/**
 * @param {{
 *   mode: 'create' | 'edit'
 *   coupon?: Record<string, unknown> | null
 * }} props
 */
export function CouponFormView({ mode, coupon = null }) {
  const t = useTranslations('Coupons')
  const tErr = useTranslations('AuthErrors')
  const tBi = useTranslations('BilingualInvoiceCompany')
  const locale = useLocale()
  const isRtl = useIsRtl()
  const router = useRouter()
  const titleId = useId()
  const alignDoc = isRtl ? 'text-end' : 'text-start'
  const bilingualFieldOrigin = useBilingualFieldOrigin()
  const { origin, reportUserInput, markAutoFilled, consumeAutoFillSkip } =
    bilingualFieldOrigin

  const initialCodeType =
    /** @type {CouponCodeTypeChoice | ''} */ (
      mode === 'edit' &&
      (coupon?.codeType === 'SHARED' || coupon?.codeType === 'UNIQUE_BATCH')
        ? coupon.codeType
        : ''
    )
  const initialDiscountKind =
    /** @type {CouponDiscountKindChoice | ''} */ (
      mode === 'edit' &&
      (coupon?.discountKind === 'PERCENTAGE' ||
        coupon?.discountKind === 'FIXED_AMOUNT' ||
        coupon?.discountKind === 'BOGO' ||
        coupon?.discountKind === 'COMBO')
        ? coupon.discountKind
        : ''
    )

  const [currentStep, setCurrentStep] = useState(
    /** @type {1 | 2} */ (mode === 'edit' ? 2 : 1),
  )
  const [codeType, setCodeType] = useState(
    /** @type {CouponCodeTypeChoice | ''} */ (initialCodeType),
  )
  const [discountKind, setDiscountKind] = useState(
    /** @type {CouponDiscountKindChoice | ''} */ (initialDiscountKind),
  )

  const [nameAr, setNameAr] = useState(
    mode === 'edit' && typeof coupon?.nameAr === 'string' ? coupon.nameAr : '',
  )
  const [nameEn, setNameEn] = useState(
    mode === 'edit' && typeof coupon?.nameEn === 'string' ? coupon.nameEn : '',
  )
  const [nameArBaseline] = useState(
    mode === 'edit' && typeof coupon?.nameAr === 'string' ? coupon.nameAr : '',
  )
  const [nameEnBaseline] = useState(
    mode === 'edit' && typeof coupon?.nameEn === 'string' ? coupon.nameEn : '',
  )
  const [minOrderAmount, setMinOrderAmount] = useState(() => {
    if (mode !== 'edit') return ''
    const v = coupon?.minOrderAmount
    if (v == null || v === '' || v === '0' || v === '0.00') return ''
    return String(v)
  })
  const [startDate, setStartDate] = useState(
    mode === 'edit' ? isoToDateInput(coupon?.startDate) : '',
  )
  const [expiresAt, setExpiresAt] = useState(
    mode === 'edit' ? isoToDateInput(coupon?.expiresAt) : '',
  )
  const [active, setActive] = useState(
    mode === 'edit' ? coupon?.active !== false : true,
  )

  const [codeMode, setCodeMode] = useState(
    /** @type {'manual' | 'generate'} */ ('manual'),
  )
  const [code, setCode] = useState(
    mode === 'edit' && typeof coupon?.code === 'string' ? coupon.code : '',
  )
  const [totalUsageUnlimited, setTotalUsageUnlimited] = useState(() => {
    if (mode !== 'edit') return true
    return coupon?.totalUsageLimit == null
  })
  const [totalUsageLimit, setTotalUsageLimit] = useState(() => {
    if (mode !== 'edit' || coupon?.totalUsageLimit == null) return ''
    return String(coupon.totalUsageLimit)
  })

  const [batchSize, setBatchSize] = useState(() => {
    if (mode === 'edit' && typeof coupon?.batchSize === 'number') {
      return String(coupon.batchSize)
    }
    return ''
  })
  const [perCodeUnlimited, setPerCodeUnlimited] = useState(true)
  const [perCodeUsageLimit, setPerCodeUsageLimit] = useState('')

  const [discountValue, setDiscountValue] = useState(() => {
    if (mode !== 'edit' || coupon?.discountValue == null) return ''
    return String(coupon.discountValue)
  })
  const [maxCapUnlimited, setMaxCapUnlimited] = useState(() => {
    if (mode !== 'edit') return true
    return coupon?.maxDiscountCap == null || coupon?.maxDiscountCap === ''
  })
  const [maxDiscountCap, setMaxDiscountCap] = useState(() => {
    if (mode !== 'edit' || coupon?.maxDiscountCap == null) return ''
    return String(coupon.maxDiscountCap)
  })

  const [buyRules, setBuyRules] = useState(() => {
    if (mode === 'edit') {
      const rows = rulesFromCoupon(coupon?.itemRules, 'BUY')
      return rows.length > 0 ? rows : [emptyItemRule('BUY')]
    }
    return [emptyItemRule('BUY')]
  })
  const [getRules, setGetRules] = useState(() => {
    if (mode === 'edit') {
      const rows = rulesFromCoupon(coupon?.itemRules, 'GET')
      return rows.length > 0 ? rows : [emptyItemRule('GET')]
    }
    return [emptyItemRule('GET')]
  })
  const [comboRules, setComboRules] = useState(() => {
    if (mode === 'edit') {
      const rows = rulesFromCoupon(coupon?.itemRules, 'COMBO_ITEM')
      return rows.length > 0 ? rows : [emptyItemRule('COMBO_ITEM')]
    }
    return [emptyItemRule('COMBO_ITEM')]
  })

  const [fieldErrors, setFieldErrors] = useState(
    /** @type {Record<string, string>} */ ({}),
  )
  const [formError, setFormError] = useState('')

  const shapeReady = Boolean(codeType) && Boolean(discountKind)
  const showStepIndicator = mode === 'create'
  const couponId = mode === 'edit' && typeof coupon?.id === 'string' ? coupon.id : ''

  const { loading: loadingNameAr } = useGeminiArSuggestion(
    nameEn,
    (ar) => {
      markAutoFilled('ar', NAME_PAIR_KEY, ar)
      setNameAr(ar.slice(0, 200))
    },
    {
      enabled:
        currentStep === 2 &&
        shouldEnableBilingualTranslate(origin, 'en', nameAr),
      shouldSkip: (trimmed) => consumeAutoFillSkip(NAME_PAIR_KEY, 'en', trimmed),
      englishBaseline: mode === 'edit' ? nameEnBaseline : undefined,
    },
  )
  const { loading: loadingNameEn } = useGeminiEnSuggestion(
    nameAr,
    (en) => {
      markAutoFilled('en', NAME_PAIR_KEY, en)
      setNameEn(en.slice(0, 200))
    },
    {
      enabled:
        currentStep === 2 &&
        shouldEnableBilingualTranslate(origin, 'ar', nameEn),
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
    enabled: currentStep === 2 && (discountKind === 'BOGO' || discountKind === 'COMBO'),
  })

  const menuPickerItems = useMemo(() => {
    return (menuItemsQuery.data ?? []).map((item) => ({
      id: item.id,
      label:
        locale === 'ar'
          ? item.nameAr
          : item.nameEn?.trim() || item.nameAr,
      sublabel:
        locale === 'ar'
          ? item.nameEn?.trim() || undefined
          : item.nameAr !== (item.nameEn?.trim() || item.nameAr)
            ? item.nameAr
            : undefined,
    }))
  }, [menuItemsQuery.data, locale])

  /** @type {Map<string, Record<string, unknown>>} */
  const menuItemById = useMemo(() => {
    /** @type {Map<string, Record<string, unknown>>} */
    const map = new Map()
    for (const item of menuItemsQuery.data ?? []) {
      if (item?.id) map.set(item.id, item)
    }
    return map
  }, [menuItemsQuery.data])

  /**
   * @param {string} menuItemId
   * @returns {Array<{ id: string, nameAr: string, nameEn?: string | null, options: Array<{ id: string, nameAr: string, nameEn?: string | null }> }>}
   */
  function variantGroupsForItem(menuItemId) {
    const item = menuItemById.get(menuItemId)
    const groups = item?.variantGroups
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

  /**
   * @param {string} menuItemId
   */
  function menuItemHasVariants(menuItemId) {
    return variantGroupsForItem(menuItemId).length > 0
  }

  /**
   * @param {{ id: string, nameAr: string, nameEn?: string | null }} row
   */
  function bilingualLabel(row) {
    if (locale === 'ar') return row.nameAr || row.nameEn || ''
    const en = typeof row.nameEn === 'string' ? row.nameEn.trim() : ''
    return en || row.nameAr || ''
  }

  function clearFieldError(key) {
    setFieldErrors((prev) => (prev[key] ? { ...prev, [key]: '' } : prev))
  }

  function handleClose() {
    router.push('/coupons')
  }

  function codeTypeLabel(value) {
    if (value === 'SHARED') return t('formCodeTypeShared')
    if (value === 'UNIQUE_BATCH') return t('formCodeTypeUniqueBatch')
    return '—'
  }

  function discountKindLabel(value) {
    if (value === 'PERCENTAGE') return t('formKindPercentage')
    if (value === 'FIXED_AMOUNT') return t('formKindFixed')
    if (value === 'BOGO') return t('formKindBogo')
    if (value === 'COMBO') return t('formKindCombo')
    return '—'
  }

  const codeTypes =
    /** @type {const} */ ([
      {
        value: 'SHARED',
        labelKey: 'formCodeTypeShared',
        descKey: 'formCodeTypeSharedDesc',
      },
      {
        value: 'UNIQUE_BATCH',
        labelKey: 'formCodeTypeUniqueBatch',
        descKey: 'formCodeTypeUniqueBatchDesc',
      },
    ])

  const discountKinds =
    /** @type {const} */ ([
      {
        value: 'PERCENTAGE',
        labelKey: 'formKindPercentage',
        descKey: 'formKindPercentageDesc',
      },
      {
        value: 'FIXED_AMOUNT',
        labelKey: 'formKindFixed',
        descKey: 'formKindFixedDesc',
      },
      {
        value: 'BOGO',
        labelKey: 'formKindBogo',
        descKey: 'formKindBogoDesc',
      },
      {
        value: 'COMBO',
        labelKey: 'formKindCombo',
        descKey: 'formKindComboDesc',
      },
    ])

  /**
   * @returns {Record<string, unknown> | null}
   */
  function buildCreateBody() {
    /** @type {Record<string, unknown>} */
    const body = {
      nameAr: nameAr.trim(),
      nameEn: nameEn.trim() || null,
      codeType,
      discountKind,
      minOrderAmount: minOrderAmount.trim() || '0',
      startDate: startDate.trim() || null,
      expiresAt: expiresAt.trim() || null,
      active,
      itemRules: [],
    }

    if (codeType === 'SHARED') {
      // Generate mode pretills the field; if the user kept it, send that code.
      // Fall back to server generateCode only if the field is somehow empty.
      if (code.trim()) {
        body.code = code.trim().toUpperCase()
      } else {
        body.generateCode = true
      }
      body.totalUsageLimit = totalUsageUnlimited
        ? null
        : Number.parseInt(totalUsageLimit, 10)
    } else if (codeType === 'UNIQUE_BATCH') {
      body.batchSize = Number.parseInt(batchSize, 10)
      body.perCodeUsageLimit = perCodeUnlimited
        ? null
        : Number.parseInt(perCodeUsageLimit, 10)
    }

    if (discountKind === 'PERCENTAGE') {
      body.discountValue = discountValue.trim()
      body.maxDiscountCap = maxCapUnlimited ? null : maxDiscountCap.trim()
    } else if (discountKind === 'FIXED_AMOUNT') {
      body.discountValue = discountValue.trim()
    } else if (discountKind === 'COMBO') {
      body.discountValue = discountValue.trim()
      body.itemRules = comboRules.map((r, i) => ({
        ruleType: 'COMBO_ITEM',
        menuItemId: r.menuItemId,
        quantity: Number.parseInt(r.quantity, 10),
        sortOrder: i,
        variantOptionIds: r.variantOptionIds ?? [],
      }))
    } else if (discountKind === 'BOGO') {
      body.itemRules = [
        ...buyRules.map((r, i) => ({
          ruleType: 'BUY',
          menuItemId: r.menuItemId,
          quantity: Number.parseInt(r.quantity, 10),
          sortOrder: i,
          variantOptionIds: r.variantOptionIds ?? [],
        })),
        ...getRules.map((r, i) => ({
          ruleType: 'GET',
          menuItemId: r.menuItemId,
          quantity: Number.parseInt(r.quantity, 10),
          discountPercent: r.discountPercent.trim(),
          sortOrder: buyRules.length + i,
          variantOptionIds: r.variantOptionIds ?? [],
        })),
      ]
    }

    return body
  }

  /**
   * @returns {Record<string, unknown>}
   */
  function buildPatchBody() {
    /** @type {Record<string, unknown>} */
    const body = {
      nameAr: nameAr.trim(),
      nameEn: nameEn.trim() || null,
      minOrderAmount: minOrderAmount.trim() || '0',
      startDate: startDate.trim() || null,
      expiresAt: expiresAt.trim() || null,
      active,
    }

    if (codeType === 'SHARED') {
      body.totalUsageLimit = totalUsageUnlimited
        ? null
        : Number.parseInt(totalUsageLimit, 10)
    }

    if (discountKind === 'PERCENTAGE') {
      body.discountValue = discountValue.trim()
      body.maxDiscountCap = maxCapUnlimited ? null : maxDiscountCap.trim()
    } else if (discountKind === 'FIXED_AMOUNT' || discountKind === 'COMBO') {
      body.discountValue = discountValue.trim()
    } else if (discountKind === 'BOGO') {
      body.discountValue = null
      body.maxDiscountCap = null
    }

    if (discountKind === 'COMBO') {
      body.itemRules = comboRules.map((r, i) => ({
        ruleType: 'COMBO_ITEM',
        menuItemId: r.menuItemId,
        quantity: Number.parseInt(r.quantity, 10),
        sortOrder: i,
        variantOptionIds: r.variantOptionIds ?? [],
      }))
    } else if (discountKind === 'BOGO') {
      body.itemRules = [
        ...buyRules.map((r, i) => ({
          ruleType: 'BUY',
          menuItemId: r.menuItemId,
          quantity: Number.parseInt(r.quantity, 10),
          sortOrder: i,
          variantOptionIds: r.variantOptionIds ?? [],
        })),
        ...getRules.map((r, i) => ({
          ruleType: 'GET',
          menuItemId: r.menuItemId,
          quantity: Number.parseInt(r.quantity, 10),
          discountPercent: r.discountPercent.trim(),
          sortOrder: buyRules.length + i,
          variantOptionIds: r.variantOptionIds ?? [],
        })),
      ]
    } else {
      body.itemRules = []
    }

    return body
  }

  function validateStep2() {
    /** @type {Record<string, string>} */
    const errors = {}
    if (!nameAr.trim()) errors.nameAr = t('formValidationNameAr')

    if (minOrderAmount.trim() && !MONEY_RE.test(minOrderAmount.trim())) {
      errors.minOrderAmount = t('formValidationMoney')
    }

    if (startDate && expiresAt) {
      const a = new Date(startDate)
      const b = new Date(expiresAt)
      if (!Number.isNaN(a.getTime()) && !Number.isNaN(b.getTime()) && b <= a) {
        errors.expiresAt = tErr('COUPON_EXPIRES_BEFORE_START')
      }
    }

    if (mode === 'create' && codeType === 'SHARED') {
      if (!code.trim()) {
        errors.code = t('formValidationCode')
      }
      if (!totalUsageUnlimited) {
        const n = Number.parseInt(totalUsageLimit, 10)
        if (!Number.isFinite(n) || n < 1) {
          errors.totalUsageLimit = t('formValidationUsageLimit')
        }
      }
    }

    if (mode === 'edit' && codeType === 'SHARED' && !totalUsageUnlimited) {
      const n = Number.parseInt(totalUsageLimit, 10)
      if (!Number.isFinite(n) || n < 1) {
        errors.totalUsageLimit = t('formValidationUsageLimit')
      }
    }

    if (mode === 'create' && codeType === 'UNIQUE_BATCH') {
      const n = Number.parseInt(batchSize, 10)
      if (!Number.isFinite(n) || n < 1) {
        errors.batchSize = t('formValidationBatchSize')
      }
      if (!perCodeUnlimited) {
        const p = Number.parseInt(perCodeUsageLimit, 10)
        if (!Number.isFinite(p) || p < 1) {
          errors.perCodeUsageLimit = t('formValidationUsageLimit')
        }
      }
    }

    if (discountKind === 'PERCENTAGE') {
      if (!discountValue.trim() || !MONEY_RE.test(discountValue.trim())) {
        errors.discountValue = t('formValidationPercent')
      } else {
        const n = Number(discountValue)
        if (n < 0 || n > 100) errors.discountValue = t('formValidationPercent')
      }
      if (!maxCapUnlimited) {
        if (!maxDiscountCap.trim() || !MONEY_RE.test(maxDiscountCap.trim())) {
          errors.maxDiscountCap = t('formValidationMoney')
        }
      }
    }

    if (discountKind === 'FIXED_AMOUNT') {
      if (!discountValue.trim() || !MONEY_RE.test(discountValue.trim())) {
        errors.discountValue = t('formValidationMoney')
      }
    }

    if (discountKind === 'COMBO') {
      if (!discountValue.trim() || !MONEY_RE.test(discountValue.trim())) {
        errors.discountValue = t('formValidationComboPrice')
      }
      if (comboRules.length === 0) {
        errors.itemRulesCombo = tErr('COUPON_COMBO_RULES_REQUIRED')
      }
      comboRules.forEach((r) => {
        if (!r.menuItemId) {
          errors[`rule-menu-${r.clientId}`] = t('formValidationMenuItem')
        }
        const q = Number.parseInt(r.quantity, 10)
        if (!Number.isFinite(q) || q < 1) {
          errors[`rule-qty-${r.clientId}`] = t('formValidationQty')
        }
        if (
          r.menuItemId &&
          menuItemHasVariants(r.menuItemId) &&
          !(r.variantOptionIds ?? []).length
        ) {
          errors[`rule-variants-${r.clientId}`] = t(
            'formValidationVariantRequired',
          )
        }
      })
    }

    if (discountKind === 'BOGO') {
      if (buyRules.length === 0 || getRules.length === 0) {
        errors.itemRulesBuy = tErr('COUPON_BOGO_RULES_INCOMPLETE')
      }
      buyRules.forEach((r) => {
        if (!r.menuItemId) {
          errors[`rule-menu-${r.clientId}`] = t('formValidationMenuItem')
        }
        const q = Number.parseInt(r.quantity, 10)
        if (!Number.isFinite(q) || q < 1) {
          errors[`rule-qty-${r.clientId}`] = t('formValidationQty')
        }
        if (
          r.menuItemId &&
          menuItemHasVariants(r.menuItemId) &&
          !(r.variantOptionIds ?? []).length
        ) {
          errors[`rule-variants-${r.clientId}`] = t(
            'formValidationVariantRequired',
          )
        }
      })
      getRules.forEach((r) => {
        if (!r.menuItemId) {
          errors[`rule-menu-${r.clientId}`] = t('formValidationMenuItem')
        }
        const q = Number.parseInt(r.quantity, 10)
        if (!Number.isFinite(q) || q < 1) {
          errors[`rule-qty-${r.clientId}`] = t('formValidationQty')
        }
        if (
          r.menuItemId &&
          menuItemHasVariants(r.menuItemId) &&
          !(r.variantOptionIds ?? []).length
        ) {
          errors[`rule-variants-${r.clientId}`] = t(
            'formValidationVariantRequired',
          )
        }
        if (
          !r.discountPercent.trim() ||
          !MONEY_RE.test(r.discountPercent.trim())
        ) {
          errors[`rule-pct-${r.clientId}`] = t('formValidationPercent')
        } else {
          const n = Number(r.discountPercent)
          if (n < 0 || n > 100) {
            errors[`rule-pct-${r.clientId}`] = t('formValidationPercent')
          }
        }
      })
    }

    return errors
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (mode === 'edit' && couponId) {
        return authPatch(`/coupons/${couponId}`, buildPatchBody())
      }
      return authPost('/coupons', buildCreateBody())
    },
    onSuccess: () => {
      toast.success(t('formSaved'))
      router.push('/coupons')
      router.refresh()
    },
    onError: (err) => {
      const code = err instanceof AuthApiError ? err.code : undefined
      const message = code ? tErr(code) : tErr('generic')
      setFormError(message)

      if (
        err instanceof AuthApiError &&
        (code === 'COUPON_ITEM_RULE_MENU_ITEM_NOT_FOUND' ||
          code === 'COUPON_ITEM_RULE_TYPE_MISMATCH' ||
          code === 'COUPON_ITEM_RULE_VARIANT_REQUIRED' ||
          code === 'COUPON_ITEM_RULE_INVALID_VARIANT')
      ) {
        const ruleIndex = readItemRuleIndexFromDetails(err.details)
        if (ruleIndex != null) {
          const ordered =
            discountKind === 'COMBO'
              ? comboRules
              : discountKind === 'BOGO'
                ? [...buyRules, ...getRules]
                : []
          const row = ordered[ruleIndex]
          if (row) {
            const fieldKey =
              code === 'COUPON_ITEM_RULE_VARIANT_REQUIRED' ||
              code === 'COUPON_ITEM_RULE_INVALID_VARIANT'
                ? `rule-variants-${row.clientId}`
                : `rule-menu-${row.clientId}`
            setFieldErrors((prev) => ({
              ...prev,
              [fieldKey]: message,
            }))
            scrollAfterFieldValidation()
            return
          }
        }
        // No addressable row → form-level banner only (already set)
        return
      }

      if (code && COUPON_ERROR_FIELD_MAP[code]) {
        const field = COUPON_ERROR_FIELD_MAP[code]
        if (field !== 'form') {
          setFieldErrors((prev) => ({ ...prev, [field]: message }))
          scrollAfterFieldValidation()
        }
      }
    },
  })

  function handleSave(e) {
    e.preventDefault()
    setFormError('')
    const errors = validateStep2()
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      scrollAfterFieldValidation()
      return
    }
    setFieldErrors({})
    saveMutation.mutate()
  }

  /**
   * @param {ReturnType<typeof emptyItemRule>} row
   * @param {(next: ReturnType<typeof emptyItemRule>[]) => void} setRows
   * @param {ReturnType<typeof emptyItemRule>[]} rows
   */
  function renderVariantChecklist(row, setRows, rows) {
    if (!row.menuItemId || !menuItemHasVariants(row.menuItemId)) return null
    const groups = variantGroupsForItem(row.menuItemId)
    const selected = new Set(row.variantOptionIds ?? [])
    const err = fieldErrors[`rule-variants-${row.clientId}`]

    return (
      <fieldset className="space-y-hisabi-md">
        <legend
          className={cn(
            'type-label-md text-hisabi-on-surface-variant flex items-center gap-1',
            alignDoc,
          )}
        >
          {t('formVariantsLegend')}
          <RequiredMark />
        </legend>
        <p className="type-body-sm text-hisabi-on-surface-variant">
          {t('formVariantsHint')}
        </p>
        {groups.map((group) => (
          <div key={group.id} className="space-y-hisabi-xs">
            <p className="type-label-md font-semibold text-hisabi-on-surface">
              {bilingualLabel(group)}
            </p>
            <div className="flex flex-col gap-hisabi-xs">
              {group.options.map((opt) => {
                const checked = selected.has(opt.id)
                return (
                  <label
                    key={opt.id}
                    className="flex cursor-pointer items-center gap-hisabi-sm"
                  >
                    <input
                      type="checkbox"
                      className="size-5 accent-hisabi-primary"
                      checked={checked}
                      onChange={() => {
                        const next = checked
                          ? (row.variantOptionIds ?? []).filter(
                              (id) => id !== opt.id,
                            )
                          : [...(row.variantOptionIds ?? []), opt.id]
                        setRows(
                          rows.map((r) =>
                            r.clientId === row.clientId
                              ? { ...r, variantOptionIds: next }
                              : r,
                          ),
                        )
                        clearFieldError(`rule-variants-${row.clientId}`)
                      }}
                    />
                    <span className="type-body-md text-hisabi-on-surface">
                      {bilingualLabel(opt)}
                    </span>
                  </label>
                )
              })}
            </div>
          </div>
        ))}
        {err ? (
          <p className="type-body-sm text-hisabi-error" role="alert">
            {err}
          </p>
        ) : null}
      </fieldset>
    )
  }

  /**
   * @param {ReturnType<typeof emptyItemRule>[]} rows
   * @param {(next: ReturnType<typeof emptyItemRule>[]) => void} setRows
   * @param {'BUY' | 'GET' | 'COMBO_ITEM'} ruleType
   * @param {string} addLabel
   * @param {boolean} showPercent
   */
  function renderItemRuleList(rows, setRows, ruleType, addLabel, showPercent) {
    return (
      <div className="space-y-hisabi-md">
        {rows.map((row, index) => (
          <div
            key={row.clientId}
            className="space-y-hisabi-md rounded-lg border border-hisabi-outline-variant bg-white p-hisabi-md"
          >
            <div className="flex items-center justify-between gap-hisabi-sm">
              <p className="type-label-md font-bold text-hisabi-on-surface">
                {t('formRuleRowTitle', { n: index + 1 })}
              </p>
              <button
                type="button"
                onClick={() =>
                  setRows(rows.filter((r) => r.clientId !== row.clientId))
                }
                className="text-hisabi-error hover:bg-hisabi-error/8 flex size-8 cursor-pointer items-center justify-center rounded-lg"
                aria-label={t('formRemoveRule')}
                disabled={rows.length <= 1}
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </div>
            {ruleType === 'GET' || showPercent ? (
              <div className="space-y-hisabi-md">
                <div className="min-w-0 space-y-hisabi-xs">
                  <label className="type-label-md text-hisabi-on-surface-variant flex items-center gap-1">
                    {t('formMenuItem')}
                    <RequiredMark />
                  </label>
                  <SearchableEntityPicker
                    items={menuPickerItems}
                    loading={menuItemsQuery.isPending}
                    value={row.menuItemId}
                    onChange={(id) => {
                      setRows(
                        rows.map((r) =>
                          r.clientId === row.clientId
                            ? {
                                ...r,
                                menuItemId: id,
                                variantOptionIds: [],
                              }
                            : r,
                        ),
                      )
                      clearFieldError(`rule-menu-${row.clientId}`)
                      clearFieldError(`rule-variants-${row.clientId}`)
                    }}
                    emptyLabel={t('formSelectMenuItem')}
                    searchPlaceholder={t('formSearchMenuItems')}
                    triggerClassName={cn(
                      fieldClass,
                      fieldErrors[`rule-menu-${row.clientId}`] &&
                        fieldInvalidClass,
                    )}
                  />
                  {fieldErrors[`rule-menu-${row.clientId}`] ? (
                    <p className="type-body-sm text-hisabi-error" role="alert">
                      {fieldErrors[`rule-menu-${row.clientId}`]}
                    </p>
                  ) : null}
                </div>
                {renderVariantChecklist(row, setRows, rows)}
                <div className="grid gap-hisabi-md sm:grid-cols-2">
                  <div className="min-w-0 space-y-hisabi-xs">
                    <label className="type-label-md text-hisabi-on-surface-variant flex items-center gap-1">
                      {t('formQuantity')}
                      <RequiredMark />
                    </label>
                    <input
                      className={cn(
                        fieldClass,
                        fieldErrors[`rule-qty-${row.clientId}`] &&
                          fieldInvalidClass,
                      )}
                      dir="ltr"
                      inputMode="numeric"
                      value={row.quantity}
                      placeholder={t('formQuantityPlaceholder')}
                      aria-invalid={
                        fieldErrors[`rule-qty-${row.clientId}`]
                          ? true
                          : undefined
                      }
                      onChange={(e) => {
                        setRows(
                          rows.map((r) =>
                            r.clientId === row.clientId
                              ? { ...r, quantity: e.target.value }
                              : r,
                          ),
                        )
                        clearFieldError(`rule-qty-${row.clientId}`)
                      }}
                    />
                    {fieldErrors[`rule-qty-${row.clientId}`] ? (
                      <p className="type-body-sm text-hisabi-error" role="alert">
                        {fieldErrors[`rule-qty-${row.clientId}`]}
                      </p>
                    ) : null}
                  </div>
                  <div className="min-w-0 space-y-hisabi-xs">
                    <label className="type-label-md text-hisabi-on-surface-variant flex items-center gap-1">
                      {t('formGetDiscountPercent')}
                      <RequiredMark />
                    </label>
                    <input
                      className={cn(
                        fieldClass,
                        fieldErrors[`rule-pct-${row.clientId}`] &&
                          fieldInvalidClass,
                      )}
                      dir="ltr"
                      inputMode="decimal"
                      value={row.discountPercent}
                      placeholder={t('formGetDiscountPercentPlaceholder')}
                      aria-invalid={
                        fieldErrors[`rule-pct-${row.clientId}`]
                          ? true
                          : undefined
                      }
                      onChange={(e) => {
                        setRows(
                          rows.map((r) =>
                            r.clientId === row.clientId
                              ? { ...r, discountPercent: e.target.value }
                              : r,
                          ),
                        )
                        clearFieldError(`rule-pct-${row.clientId}`)
                      }}
                    />
                    {fieldErrors[`rule-pct-${row.clientId}`] ? (
                      <p className="type-body-sm text-hisabi-error" role="alert">
                        {fieldErrors[`rule-pct-${row.clientId}`]}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-hisabi-md">
              <div className="grid gap-hisabi-md sm:grid-cols-2">
                <div className="min-w-0 space-y-hisabi-xs">
                  <label className="type-label-md text-hisabi-on-surface-variant flex items-center gap-1">
                    {t('formMenuItem')}
                    <RequiredMark />
                  </label>
                  <SearchableEntityPicker
                    items={menuPickerItems}
                    loading={menuItemsQuery.isPending}
                    value={row.menuItemId}
                    onChange={(id) => {
                      setRows(
                        rows.map((r) =>
                          r.clientId === row.clientId
                            ? {
                                ...r,
                                menuItemId: id,
                                variantOptionIds: [],
                              }
                            : r,
                        ),
                      )
                      clearFieldError(`rule-menu-${row.clientId}`)
                      clearFieldError(`rule-variants-${row.clientId}`)
                    }}
                    emptyLabel={t('formSelectMenuItem')}
                    searchPlaceholder={t('formSearchMenuItems')}
                    triggerClassName={cn(
                      fieldClass,
                      fieldErrors[`rule-menu-${row.clientId}`] &&
                        fieldInvalidClass,
                    )}
                  />
                  {fieldErrors[`rule-menu-${row.clientId}`] ? (
                    <p className="type-body-sm text-hisabi-error" role="alert">
                      {fieldErrors[`rule-menu-${row.clientId}`]}
                    </p>
                  ) : null}
                </div>
                <div className="min-w-0 space-y-hisabi-xs">
                  <label className="type-label-md text-hisabi-on-surface-variant flex items-center gap-1">
                    {t('formQuantity')}
                    <RequiredMark />
                  </label>
                  <input
                    className={cn(
                      fieldClass,
                      fieldErrors[`rule-qty-${row.clientId}`] &&
                        fieldInvalidClass,
                    )}
                    dir="ltr"
                    inputMode="numeric"
                    value={row.quantity}
                    placeholder={t('formQuantityPlaceholder')}
                    aria-invalid={
                      fieldErrors[`rule-qty-${row.clientId}`]
                        ? true
                        : undefined
                    }
                    onChange={(e) => {
                      setRows(
                        rows.map((r) =>
                          r.clientId === row.clientId
                            ? { ...r, quantity: e.target.value }
                            : r,
                        ),
                      )
                      clearFieldError(`rule-qty-${row.clientId}`)
                    }}
                  />
                  {fieldErrors[`rule-qty-${row.clientId}`] ? (
                    <p className="type-body-sm text-hisabi-error" role="alert">
                      {fieldErrors[`rule-qty-${row.clientId}`]}
                    </p>
                  ) : null}
                </div>
              </div>
              {renderVariantChecklist(row, setRows, rows)}
              </div>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => setRows([...rows, emptyItemRule(ruleType)])}
          className="type-label-sm inline-flex cursor-pointer items-center gap-1 font-semibold text-hisabi-secondary hover:underline"
        >
          <Plus className="size-4 shrink-0" aria-hidden />
          {addLabel}
        </button>
      </div>
    )
  }

  /**
   * @param {string} id
   * @param {string} label
   * @param {boolean} unlimited
   * @param {(v: boolean) => void} setUnlimited
   * @param {string} value
   * @param {(v: string) => void} setValue
   * @param {string} errorKey
   * @param {string} unlimitedLabel
   */
  function renderLimitedNumberField(
    id,
    label,
    unlimited,
    setUnlimited,
    value,
    setValue,
    errorKey,
    unlimitedLabel,
  ) {
    return (
      <div className="min-w-0 space-y-hisabi-xs">
        <label
          htmlFor={id}
          className={cn(
            'type-label-md text-hisabi-on-surface-variant flex items-center gap-1',
            alignDoc,
          )}
        >
          {label}
        </label>
        <label className="mb-hisabi-xs flex cursor-pointer items-center gap-hisabi-sm">
          <input
            type="checkbox"
            className="size-5 accent-hisabi-primary"
            checked={unlimited}
            onChange={(e) => {
              setUnlimited(e.target.checked)
              if (e.target.checked) {
                setValue('')
                clearFieldError(errorKey)
              }
            }}
          />
          <span className="type-body-sm text-hisabi-on-surface">
            {unlimitedLabel}
          </span>
        </label>
        {!unlimited ? (
          <>
            <input
              id={id}
              className={cn(
                fieldClass,
                fieldErrors[errorKey] && fieldInvalidClass,
              )}
              dir="ltr"
              inputMode="numeric"
              value={value}
              placeholder={t('formUsageLimitPlaceholder')}
              aria-invalid={fieldErrors[errorKey] ? true : undefined}
              onChange={(e) => {
                setValue(e.target.value)
                clearFieldError(errorKey)
              }}
            />
            {fieldErrors[errorKey] ? (
              <p className="type-body-sm text-hisabi-error" role="alert">
                {fieldErrors[errorKey]}
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    )
  }

  const batchPreviewN = Number.parseInt(batchSize, 10)
  const showBatchPreview =
    mode === 'create' &&
    codeType === 'UNIQUE_BATCH' &&
    Number.isFinite(batchPreviewN) &&
    batchPreviewN >= 1

  return (
    <div className="min-h-screen bg-transparent pb-hisabi-xxl">
      <header className="border-b border-transparent bg-transparent">
        <div className="mx-auto flex min-h-20 max-w-hisabi-container flex-wrap items-center gap-hisabi-md px-hisabi-md py-hisabi-md sm:px-hisabi-xl">
          <button
            type="button"
            onClick={handleClose}
            className="text-hisabi-primary hover:bg-hisabi-surface-container-low flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors"
            aria-label={t('formBackToList')}
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
              {mode === 'edit' ? t('formEditTitle') : t('formNewTitle')}
            </h1>
            <p
              className={cn(
                'type-body-md text-hisabi-on-surface-variant mt-0.5 max-w-2xl',
                alignDoc,
              )}
            >
              {mode === 'edit' ? t('formEditSubtitle') : t('formNewSubtitle')}
            </p>
          </div>
        </div>
      </header>

      <div
        className="mx-auto w-full max-w-hisabi-container space-y-hisabi-xl px-hisabi-md sm:px-hisabi-xl"
        aria-labelledby={titleId}
      >
        {showStepIndicator ? (
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
              className={cn(
                'type-label-sm flex min-w-0 flex-1 cursor-pointer items-center justify-center rounded-lg px-2 py-2.5 text-center font-bold transition-colors',
                currentStep === 1
                  ? 'bg-hisabi-primary-container text-white'
                  : 'text-hisabi-on-surface-variant hover:bg-hisabi-surface-container',
              )}
            >
              {t('formStepTabShape')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={currentStep === 2}
              disabled={!shapeReady}
              onClick={() => {
                if (!shapeReady) return
                setCurrentStep(2)
              }}
              className={cn(
                'type-label-sm flex min-w-0 flex-1 items-center justify-center rounded-lg px-2 py-2.5 text-center font-bold transition-colors',
                currentStep === 2
                  ? 'bg-hisabi-primary-container text-white'
                  : 'text-hisabi-on-surface-variant hover:bg-hisabi-surface-container',
                !shapeReady
                  ? 'cursor-not-allowed opacity-50 hover:bg-transparent'
                  : 'cursor-pointer',
              )}
            >
              {t('formStepTabDetails')}
            </button>
          </div>
        ) : null}

        {currentStep === 1 && mode === 'create' ? (
          <>
            <SettingsSection title={t('formSectionShape')} icon={Shapes}>
              <fieldset className="space-y-hisabi-md">
                <legend
                  className={cn(
                    'type-label-md text-hisabi-on-surface-variant mb-hisabi-sm flex items-center gap-1',
                    alignDoc,
                  )}
                >
                  {t('formCodeTypeLegend')}
                  <RequiredMark />
                </legend>
                <div className={cn(SEGMENT_SHELL, 'flex-col gap-1 sm:flex-row')}>
                  {codeTypes.map((opt) => {
                    const selected = codeType === opt.value
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setCodeType(opt.value)}
                        aria-pressed={selected}
                        className={cn(
                          segmentOptionClass(selected),
                          'flex-col items-stretch gap-1 px-hisabi-md py-hisabi-md text-start sm:text-center',
                        )}
                      >
                        <span className="font-bold">{t(opt.labelKey)}</span>
                        <span
                          className={cn(
                            'type-body-sm font-medium',
                            selected
                              ? 'text-white/90'
                              : 'text-hisabi-on-surface-variant',
                          )}
                        >
                          {t(opt.descKey)}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </fieldset>

              <fieldset className="space-y-hisabi-md">
                <legend
                  className={cn(
                    'type-label-md text-hisabi-on-surface-variant mb-hisabi-sm flex items-center gap-1',
                    alignDoc,
                  )}
                >
                  {t('formDiscountKindLegend')}
                  <RequiredMark />
                </legend>
                <div
                  className={cn(
                    SEGMENT_SHELL,
                    'grid grid-cols-1 gap-1 sm:grid-cols-2',
                  )}
                >
                  {discountKinds.map((opt) => {
                    const selected = discountKind === opt.value
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setDiscountKind(opt.value)}
                        aria-pressed={selected}
                        className={cn(
                          segmentOptionClass(selected),
                          'flex-col items-stretch gap-1 px-hisabi-md py-hisabi-md text-start',
                        )}
                      >
                        <span className="font-bold">{t(opt.labelKey)}</span>
                        <span
                          className={cn(
                            'type-body-sm font-medium',
                            selected
                              ? 'text-white/90'
                              : 'text-hisabi-on-surface-variant',
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
              <button
                type="button"
                onClick={handleClose}
                className={SECONDARY_BTN_CLASS}
              >
                {t('cancel')}
              </button>
              <AuthSubmitButton
                type="button"
                variant="gold"
                disabled={!shapeReady}
                onClick={() => {
                  if (!shapeReady) return
                  setCurrentStep(2)
                }}
                className="min-h-0 w-full min-w-0 py-4 min-[500px]:w-auto min-[500px]:min-w-[12rem]"
              >
                {t('formNext')}
              </AuthSubmitButton>
            </div>
          </>
        ) : null}

        {currentStep === 2 ? (
          <form
            noValidate
            className="flex flex-col"
            onSubmit={handleSave}
          >
            <div className="space-y-hisabi-xl">
            {formError ? (
              <p className="type-body-md text-hisabi-error" role="alert">
                {formError}
              </p>
            ) : null}

            {mode === 'edit' || shapeReady ? (
              <SettingsSection title={t('detailSectionBasics')} icon={TicketPercent}>
                <dl className="grid gap-hisabi-md sm:grid-cols-2">
                  <div>
                    <dt className="type-label-md text-hisabi-on-surface-variant">
                      {t('formCodeTypeLegend')}
                    </dt>
                    <dd className="type-body-md font-semibold text-hisabi-on-surface">
                      {codeTypeLabel(codeType)}
                    </dd>
                  </div>
                  <div>
                    <dt className="type-label-md text-hisabi-on-surface-variant">
                      {t('formDiscountKindLegend')}
                    </dt>
                    <dd className="type-body-md font-semibold text-hisabi-on-surface">
                      {discountKindLabel(discountKind)}
                    </dd>
                  </div>
                  {mode === 'edit' ? (
                    <>
                      <div>
                        <dt className="type-label-md text-hisabi-on-surface-variant">
                          {t('colCode')}
                        </dt>
                        <dd
                          className="type-body-md font-semibold text-hisabi-on-surface"
                          dir="ltr"
                        >
                          {coupon?.codeType === 'UNIQUE_BATCH'
                            ? t('batchOf', {
                                size:
                                  typeof coupon?.batchSize === 'number'
                                    ? coupon.batchSize
                                    : 0,
                              })
                            : typeof coupon?.code === 'string' &&
                                coupon.code.length > 0
                              ? coupon.code
                              : '—'}
                        </dd>
                      </div>
                      {coupon?.codeType === 'UNIQUE_BATCH' ? (
                        <div>
                          <dt className="type-label-md text-hisabi-on-surface-variant">
                            {t('formBatchSizeLabel')}
                          </dt>
                          <dd
                            className="type-body-md font-semibold text-hisabi-on-surface"
                            dir="ltr"
                          >
                            {typeof coupon?.batchSize === 'number'
                              ? coupon.batchSize
                              : '—'}
                          </dd>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </dl>
                {mode === 'edit' ? (
                  <p className="type-body-sm text-hisabi-on-surface-variant">
                    {t('formStructuralLockedHint')}
                  </p>
                ) : null}

            <div className="grid gap-hisabi-lg sm:grid-cols-2">
              <div
                dir="ltr"
                className="grid grid-cols-1 gap-hisabi-lg sm:col-span-2 sm:grid-cols-2"
              >
                <div className="min-w-0 space-y-hisabi-xs text-start">
                  <label
                    htmlFor="coupon-name-en"
                    className="type-label-md text-hisabi-on-surface-variant flex items-center gap-2"
                  >
                    {t('formNameEn')}
                    {loadingNameEn ? (
                      <HisabiSpinner size="inline" className="text-hisabi-teal" label={tBi('translating')} />
                    ) : null}
                  </label>
                  <input
                    id="coupon-name-en"
                    className={fieldClass}
                    value={nameEn}
                    maxLength={200}
                    placeholder={t('formNameEnPlaceholder')}
                    dir="ltr"
                    onChange={(e) => {
                      const next = e.target.value.slice(0, 200)
                      reportUserInput('en', NAME_PAIR_KEY, {
                        otherFieldEmpty: !nameAr.trim(),
                      })
                      setNameEn(next)
                    }}
                  />
                </div>
                <div className="min-w-0 space-y-hisabi-xs text-start">
                  <label
                    htmlFor="coupon-name-ar"
                    className="type-label-md text-hisabi-on-surface-variant flex items-center gap-2"
                  >
                    {t('formNameAr')}
                    <RequiredMark />
                    {loadingNameAr ? (
                      <HisabiSpinner size="inline" className="text-hisabi-teal" label={tBi('translating')} />
                    ) : null}
                  </label>
                  <input
                    id="coupon-name-ar"
                    className={cn(
                      fieldClass,
                      fieldErrors.nameAr && fieldInvalidClass,
                    )}
                    value={nameAr}
                    maxLength={200}
                    placeholder={t('formNameArPlaceholder')}
                    dir="rtl"
                    aria-invalid={fieldErrors.nameAr ? true : undefined}
                    onChange={(e) => {
                      const next = e.target.value.slice(0, 200)
                      reportUserInput('ar', NAME_PAIR_KEY, {
                        otherFieldEmpty: !nameEn.trim(),
                      })
                      setNameAr(next)
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

              <div className="min-w-0 space-y-hisabi-xs">
                <label
                  htmlFor="coupon-min-order"
                  className={cn(
                    'type-label-md text-hisabi-on-surface-variant block',
                    alignDoc,
                  )}
                >
                  {t('formMinOrder')}
                </label>
                <input
                  id="coupon-min-order"
                  className={cn(
                    fieldClass,
                    fieldErrors.minOrderAmount && fieldInvalidClass,
                  )}
                  dir="ltr"
                  inputMode="decimal"
                  value={minOrderAmount}
                  placeholder={t('formMinOrderPlaceholder')}
                  aria-invalid={fieldErrors.minOrderAmount ? true : undefined}
                  onChange={(e) => {
                    setMinOrderAmount(e.target.value)
                    clearFieldError('minOrderAmount')
                  }}
                />
                <p className="type-body-sm text-hisabi-on-surface-variant">
                  {t('formMinOrderHint')}
                </p>
                {fieldErrors.minOrderAmount ? (
                  <p className="type-body-sm text-hisabi-error" role="alert">
                    {fieldErrors.minOrderAmount}
                  </p>
                ) : null}
              </div>

              <fieldset className="min-w-0 space-y-hisabi-xs">
                <legend
                  className={cn(
                    'type-label-md text-hisabi-on-surface-variant',
                    alignDoc,
                  )}
                >
                  {t('formActiveLabel')}
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

              <div className="min-w-0 space-y-hisabi-xs">
                <label
                  htmlFor="coupon-start"
                  className={cn(
                    'type-label-md text-hisabi-on-surface-variant block',
                    alignDoc,
                  )}
                >
                  {t('formStartDate')}
                </label>
                <input
                  id="coupon-start"
                  type="date"
                  className={fieldClass}
                  dir="ltr"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value)
                    clearFieldError('expiresAt')
                  }}
                />
              </div>
              <div className="min-w-0 space-y-hisabi-xs">
                <label
                  htmlFor="coupon-expires"
                  className={cn(
                    'type-label-md text-hisabi-on-surface-variant block',
                    alignDoc,
                  )}
                >
                  {t('formExpiresAt')}
                </label>
                <input
                  id="coupon-expires"
                  type="date"
                  className={cn(
                    fieldClass,
                    fieldErrors.expiresAt && fieldInvalidClass,
                  )}
                  dir="ltr"
                  value={expiresAt}
                  aria-invalid={fieldErrors.expiresAt ? true : undefined}
                  onChange={(e) => {
                    setExpiresAt(e.target.value)
                    clearFieldError('expiresAt')
                  }}
                />
                {fieldErrors.expiresAt ? (
                  <p className="type-body-sm text-hisabi-error" role="alert">
                    {fieldErrors.expiresAt}
                  </p>
                ) : null}
              </div>
            </div>

            {codeType === 'SHARED' ? (
              renderLimitedNumberField(
                mode === 'edit'
                  ? 'coupon-total-usage-edit'
                  : 'coupon-total-usage',
                t('formTotalUsageLimit'),
                totalUsageUnlimited,
                setTotalUsageUnlimited,
                totalUsageLimit,
                setTotalUsageLimit,
                'totalUsageLimit',
                t('formNoLimit'),
              )
            ) : null}

            {codeType === 'UNIQUE_BATCH' && mode === 'create'
              ? renderLimitedNumberField(
                  'coupon-per-code-usage',
                  t('formPerCodeUsageLimit'),
                  perCodeUnlimited,
                  setPerCodeUnlimited,
                  perCodeUsageLimit,
                  setPerCodeUsageLimit,
                  'perCodeUsageLimit',
                  t('formNoLimit'),
                )
              : null}
            </SettingsSection>
            ) : null}

            {codeType === 'SHARED' && mode === 'create' ? (
              <SettingsSection title={t('formSectionCodes')} icon={Hash}>
              <div className="space-y-hisabi-md">
                <div className="grid gap-hisabi-md sm:grid-cols-2 sm:items-end">
                  <fieldset className="min-w-0 space-y-hisabi-xs">
                    <legend
                      className={cn(
                        'type-label-md text-hisabi-on-surface-variant mb-hisabi-sm',
                        alignDoc,
                      )}
                    >
                      {t('formSharedCodeMode')}
                      <RequiredMark />
                    </legend>
                    <div className={SEGMENT_SHELL}>
                      {(
                        /** @type {const} */ ([
                          ['manual', 'formCodeModeManual'],
                          ['generate', 'formCodeModeGenerate'],
                        ])
                      ).map(([value, labelKey]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => {
                            setCodeMode(value)
                            if (value === 'generate') {
                              setCode(generateCouponCodeStringClient())
                              clearFieldError('code')
                            }
                          }}
                          className={segmentOptionClass(codeMode === value)}
                        >
                          {t(labelKey)}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <div className="min-w-0 space-y-hisabi-xs">
                    <label
                      htmlFor="coupon-code"
                      className={cn(
                        'type-label-md text-hisabi-on-surface-variant flex items-center gap-1',
                        alignDoc,
                      )}
                    >
                      {t('formSharedCode')}
                      <RequiredMark />
                    </label>
                    <input
                      id="coupon-code"
                      className={cn(
                        fieldClass,
                        fieldErrors.code && fieldInvalidClass,
                      )}
                      dir="ltr"
                      value={code}
                      placeholder={t('formSharedCodePlaceholder')}
                      aria-invalid={fieldErrors.code ? true : undefined}
                      onChange={(e) => {
                        const next = e.target.value.toUpperCase()
                        setCode(next)
                        if (codeMode === 'generate') {
                          setCodeMode('manual')
                        }
                        clearFieldError('code')
                      }}
                    />
                    {fieldErrors.code ? (
                      <p className="type-body-sm text-hisabi-error" role="alert">
                        {fieldErrors.code}
                      </p>
                    ) : null}
                  </div>
                </div>
                {codeMode === 'generate' ? (
                  <p className="type-body-sm text-hisabi-on-surface-variant">
                    {t('formGenerateCodeNote')}
                  </p>
                ) : null}
              </div>
              </SettingsSection>
            ) : null}

            {codeType === 'UNIQUE_BATCH' && mode === 'create' ? (
              <SettingsSection title={t('formSectionCodes')} icon={Hash}>
                <div className="min-w-0 space-y-hisabi-xs">
                  <label
                    htmlFor="coupon-batch-size"
                    className={cn(
                      'type-label-md text-hisabi-on-surface-variant flex items-center gap-1',
                      alignDoc,
                    )}
                  >
                    {t('formBatchSizeLabel')}
                    <RequiredMark />
                  </label>
                  <input
                    id="coupon-batch-size"
                    className={cn(
                      fieldClass,
                      fieldErrors.batchSize && fieldInvalidClass,
                    )}
                    dir="ltr"
                    inputMode="numeric"
                    value={batchSize}
                    placeholder={t('formBatchSizePlaceholder')}
                    aria-invalid={fieldErrors.batchSize ? true : undefined}
                    onChange={(e) => {
                      setBatchSize(e.target.value)
                      clearFieldError('batchSize')
                    }}
                  />
                  <p className="type-body-sm text-hisabi-on-surface-variant">
                    {t('formBatchSizeHint')}
                  </p>
                  {fieldErrors.batchSize ? (
                    <p className="type-body-sm text-hisabi-error" role="alert">
                      {fieldErrors.batchSize}
                    </p>
                  ) : null}
                </div>
              </SettingsSection>
            ) : null}

            {discountKind === 'PERCENTAGE' ||
            discountKind === 'FIXED_AMOUNT' ||
            discountKind === 'COMBO' ? (
              <SettingsSection title={t('formSectionDiscount')} icon={Percent}>
              <div className="grid gap-hisabi-lg sm:grid-cols-2">
                <div className="min-w-0 space-y-hisabi-xs">
                  <label
                    htmlFor="coupon-discount-value"
                    className={cn(
                      'type-label-md text-hisabi-on-surface-variant flex items-center gap-1',
                      alignDoc,
                    )}
                  >
                    {discountKind === 'COMBO'
                      ? t('formComboPrice')
                      : discountKind === 'PERCENTAGE'
                        ? t('formDiscountPercent')
                        : t('formDiscountAmount')}
                    <RequiredMark />
                  </label>
                  <input
                    id="coupon-discount-value"
                    className={cn(
                      fieldClass,
                      fieldErrors.discountValue && fieldInvalidClass,
                    )}
                    dir="ltr"
                    inputMode="decimal"
                    value={discountValue}
                    placeholder={
                      discountKind === 'COMBO'
                        ? t('formComboPricePlaceholder')
                        : discountKind === 'PERCENTAGE'
                          ? t('formDiscountPercentPlaceholder')
                          : t('formDiscountAmountPlaceholder')
                    }
                    aria-invalid={
                      fieldErrors.discountValue ? true : undefined
                    }
                    onChange={(e) => {
                      setDiscountValue(e.target.value)
                      clearFieldError('discountValue')
                    }}
                  />
                  {discountKind === 'COMBO' ? (
                    <p className="type-body-sm text-hisabi-on-surface-variant">
                      {t('formComboPriceHint')}
                    </p>
                  ) : null}
                  {fieldErrors.discountValue ? (
                    <p className="type-body-sm text-hisabi-error" role="alert">
                      {fieldErrors.discountValue}
                    </p>
                  ) : null}
                </div>
                {discountKind === 'PERCENTAGE' ? (
                  <div className="min-w-0 space-y-hisabi-xs">
                    <label
                      htmlFor="coupon-max-cap"
                      className={cn(
                        'type-label-md text-hisabi-on-surface-variant block',
                        alignDoc,
                      )}
                    >
                      {t('formMaxDiscountCap')}
                    </label>
                    <label className="mb-hisabi-xs flex cursor-pointer items-center gap-hisabi-sm">
                      <input
                        type="checkbox"
                        className="size-5 accent-hisabi-primary"
                        checked={maxCapUnlimited}
                        onChange={(e) => {
                          setMaxCapUnlimited(e.target.checked)
                          if (e.target.checked) {
                            setMaxDiscountCap('')
                            clearFieldError('maxDiscountCap')
                          }
                        }}
                      />
                      <span className="type-body-sm text-hisabi-on-surface">
                        {t('formNoCap')}
                      </span>
                    </label>
                    {!maxCapUnlimited ? (
                      <>
                        <input
                          id="coupon-max-cap"
                          className={cn(
                            fieldClass,
                            fieldErrors.maxDiscountCap && fieldInvalidClass,
                          )}
                          dir="ltr"
                          inputMode="decimal"
                          value={maxDiscountCap}
                          placeholder={t('formMaxDiscountCapPlaceholder')}
                          aria-invalid={
                            fieldErrors.maxDiscountCap ? true : undefined
                          }
                          onChange={(e) => {
                            setMaxDiscountCap(e.target.value)
                            clearFieldError('maxDiscountCap')
                          }}
                        />
                        {fieldErrors.maxDiscountCap ? (
                          <p
                            className="type-body-sm text-hisabi-error"
                            role="alert"
                          >
                            {fieldErrors.maxDiscountCap}
                          </p>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
              </SettingsSection>
            ) : null}

            {discountKind === 'BOGO' ? (
              <SettingsSection title={t('formSectionItems')} icon={ShoppingBag}>
              <div className="space-y-hisabi-xl">
                <div className="space-y-hisabi-md">
                  <h2 className="type-label-md font-bold text-hisabi-on-surface">
                    {t('formBuyItemsTitle')}
                  </h2>
                  {fieldErrors.itemRulesBuy ? (
                    <p className="type-body-sm text-hisabi-error" role="alert">
                      {fieldErrors.itemRulesBuy}
                    </p>
                  ) : null}
                  {renderItemRuleList(
                    buyRules,
                    setBuyRules,
                    'BUY',
                    t('formAddBuyItem'),
                    false,
                  )}
                </div>
                <div className="space-y-hisabi-md">
                  <h2 className="type-label-md font-bold text-hisabi-on-surface">
                    {t('formGetItemsTitle')}
                  </h2>
                  {fieldErrors.itemRulesGet ? (
                    <p className="type-body-sm text-hisabi-error" role="alert">
                      {fieldErrors.itemRulesGet}
                    </p>
                  ) : null}
                  {renderItemRuleList(
                    getRules,
                    setGetRules,
                    'GET',
                    t('formAddGetItem'),
                    true,
                  )}
                </div>
              </div>
              </SettingsSection>
            ) : null}

            {discountKind === 'COMBO' ? (
              <SettingsSection title={t('formComboItemsTitle')} icon={ShoppingBag}>
                {fieldErrors.itemRulesCombo ? (
                  <p className="type-body-sm text-hisabi-error" role="alert">
                    {fieldErrors.itemRulesCombo}
                  </p>
                ) : null}
                {renderItemRuleList(
                  comboRules,
                  setComboRules,
                  'COMBO_ITEM',
                  t('formAddComboItem'),
                  false,
                )}
              </SettingsSection>
            ) : null}

            {showBatchPreview ? (
              <p
                className="type-body-md rounded-lg border border-hisabi-outline-variant/40 bg-hisabi-surface-container-low/50 px-hisabi-md py-hisabi-md font-semibold text-hisabi-on-surface"
                role="status"
              >
                {t('formBatchPreview', { count: batchPreviewN })}
              </p>
            ) : null}
            </div>

            <div
              className={cn(
                FORM_FOOTER_CLASS,
                mode === 'create' &&
                  'min-[500px]:justify-between',
              )}
            >
              <div className="flex w-full flex-col-reverse gap-hisabi-md min-[500px]:w-auto min-[500px]:flex-row">
                {mode === 'create' ? (
                  <button
                    type="button"
                    onClick={() => setCurrentStep(1)}
                    disabled={saveMutation.isPending}
                    className={SECONDARY_BTN_CLASS}
                  >
                    {t('formBack')}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={saveMutation.isPending}
                  className={SECONDARY_BTN_CLASS}
                >
                  {t('cancel')}
                </button>
              </div>
              <AuthSubmitButton
                type="submit"
                variant="gold"
                pending={saveMutation.isPending}
                className="min-h-0 w-full min-w-0 py-4 min-[500px]:w-auto min-[500px]:min-w-[12rem]"
              >
                <span className="flex items-center justify-center gap-hisabi-sm">
                  <Save className="size-5 shrink-0" aria-hidden />
                  {saveMutation.isPending ? t('formSaving') : t('formSave')}
                </span>
              </AuthSubmitButton>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  )
}
