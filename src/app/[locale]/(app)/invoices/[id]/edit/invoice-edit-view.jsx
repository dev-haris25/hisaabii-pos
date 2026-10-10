'use client'

import { useMutation } from '@tanstack/react-query'
import { Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { HisabiSpinner } from '@/components/hisabi-spinner'
import { AuthSubmitButton } from '@/components/auth/auth-submit-button'
import { HisabiOverlayModal } from '@/components/hisabi-overlay-modal'
import { PosThermalReceiptPreview } from '@/components/invoices/pos-thermal-receipt-preview'
import { LineModifierSummary } from '@/components/pos/line-modifier-summary'
import { PosItemModifiersFlow } from '@/components/pos/pos-item-modifiers-flow'
import { PageBackButton } from '@/components/shared/page-back-button'
import { RequiredMark } from '@/components/ui/required-mark'
import { useGeminiArSuggestion } from '@/hooks/use-gemini-ar-suggestion'
import { useGeminiEnSuggestion } from '@/hooks/use-gemini-en-suggestion'
import { useIsHisabiDesktop } from '@/hooks/use-is-hisabi-desktop'
import { useRouter } from '@/i18n/navigation'
import { AuthApiError, authPatch, authPost } from '@/lib/api/auth-client'
import { printDocument } from '@/lib/print/print-document'
import { receiptActionLabel } from '@/lib/print/receipt-action-label'
import { toastPrintError } from '@/lib/print/toast-print-error'
import { toastPrintResult } from '@/lib/print/toast-print-result'
import {
  computeInvoiceTotals,
  decimalStringFromNumber,
  parseMoney,
} from '@/lib/invoices/invoice-compute-totals'
import {
  shouldEnableBilingualTranslate,
  useBilingualFieldOrigin,
} from '@/lib/i18n/use-bilingual-field-origin'
import { scrollAfterFieldValidation } from '@/lib/ui/scroll-first-invalid-field'
import {
  buildModifiersSnapshotFromItem,
  cartLineKey,
  menuItemHasCustomizations,
  menuItemHasVariantGroups,
} from '@/lib/menu/item-modifiers'
import { formatOrderNumber } from '@/lib/orders/riyadh-order-date'
import { cn } from '@/lib/utils'

const REASON_PAIR_KEY = 'invoices.edit.reason'

const fieldClass =
  'type-body-md text-hisabi-on-surface placeholder:text-hisabi-outline/70 w-full rounded-lg border border-hisabi-outline-variant bg-hisabi-surface px-hisabi-md py-hisabi-sm outline-none transition-shadow focus:border-hisabi-primary focus:ring-2 focus:ring-hisabi-primary/10'

/**
 * @typedef {{
 *   key: string
 *   invoiceLineId?: string | null
 *   menuItemId?: string | null
 *   nameAr: string
 *   nameEn?: string | null
 *   quantity: number
 *   unitPrice: string
 *   vatPreset: string
 *   imageUrl?: string | null
 *   lineNote?: string | null
 *   modifiersSnapshot?: unknown
 * }} EditCartLine
 */

/**
 * @param {{
 *   mode?: 'correction' | 'repair'
 *   invoice: {
 *     id: string
 *     invoiceNumber: string
 *     subtotal: string
 *     totalVat: string
 *     grandTotal: string
 *     lines: Array<{ id: string, quantity: number, unitPrice: string, vatPreset: string, discount: string }>
 *   }
 *   cartSeed: EditCartLine[]
 *   categories: Array<{ id: string, nameAr: string, nameEn: string | null }>
 *   menuItems: Array<{
 *     id: string
 *     nameAr: string
 *     nameEn: string | null
 *     price: string
 *     vatPreset: string
 *     categoryId: string | null
 *     imageUrl: string | null
 *   }>
 *   logoUrl?: string | null
 * }} props
 */
export function InvoiceEditView({
  mode = 'correction',
  invoice,
  cartSeed,
  categories,
  menuItems,
  logoUrl = null,
}) {
  const isRepair = mode === 'repair'
  const t = useTranslations('Invoices')
  const tPos = useTranslations('Pos')
  const desktop = useIsHisabiDesktop()
  const tBi = useTranslations('BilingualInvoiceCompany')
  const tErr = useTranslations('AuthErrors')
  const locale = useLocale()
  const router = useRouter()
  const {
    origin,
    reportUserInput,
    markAutoFilled,
    consumeAutoFillSkip,
  } = useBilingualFieldOrigin()

  const [categoryId, setCategoryId] = useState(/** @type {string | 'all'} */ ('all'))
  /** @type {[EditCartLine[], function]} */
  const [cart, setCart] = useState(cartSeed)
  const [reasonAr, setReasonAr] = useState('')
  const [reasonEn, setReasonEn] = useState('')
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({ reasonAr: '' })
  /** @type {[{ documentNature: 'credit' | 'debit', note: Record<string, unknown> } | null, function]} */
  const [createdNote, setCreatedNote] = useState(null)
  const [configuratorItem, setConfiguratorItem] = useState(
    /** @type {Record<string, unknown> | null} */ (null),
  )

  const { loading: loadingReasonAr } = useGeminiArSuggestion(
    reasonEn,
    (ar) => {
      markAutoFilled('ar', REASON_PAIR_KEY, ar)
      setReasonAr(ar.slice(0, 500))
    },
    {
      enabled:
        !isRepair && shouldEnableBilingualTranslate(origin, 'en', reasonAr),
      shouldSkip: (trimmed) =>
        consumeAutoFillSkip(REASON_PAIR_KEY, 'en', trimmed),
    },
  )
  const { loading: loadingReasonEn } = useGeminiEnSuggestion(
    reasonAr,
    (en) => {
      markAutoFilled('en', REASON_PAIR_KEY, en)
      setReasonEn(en.slice(0, 500))
    },
    {
      enabled:
        !isRepair && shouldEnableBilingualTranslate(origin, 'ar', reasonEn),
      shouldSkip: (trimmed) =>
        consumeAutoFillSkip(REASON_PAIR_KEY, 'ar', trimmed),
    },
  )

  const filteredItems = useMemo(() => {
    if (categoryId === 'all') return menuItems
    return menuItems.filter((item) => item.categoryId === categoryId)
  }, [menuItems, categoryId])

  const originalTotals = useMemo(
    () =>
      computeInvoiceTotals(
        invoice.lines.map((l) => ({
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discount: l.discount ?? '0',
          vatPreset: l.vatPreset,
        })),
      ),
    [invoice.lines],
  )

  const cartTotals = useMemo(() => {
    if (cart.length === 0) {
      return {
        subtotal: '0.00',
        totalDiscount: '0.00',
        totalVat: '0.00',
        grandTotal: '0.00',
        perLine: [],
      }
    }
    return computeInvoiceTotals(
      cart.map((line) => ({
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discount: '0',
        vatPreset: line.vatPreset,
      })),
    )
  }, [cart])

  const editMutation = useMutation({
    mutationFn: () => {
      const lines = cart.map((l) => ({
        invoiceLineId: l.invoiceLineId ?? undefined,
        menuItemId: l.menuItemId ?? undefined,
        nameAr: l.nameAr,
        nameEn: l.nameEn ?? undefined,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        vatPreset: l.vatPreset,
        modifiersSnapshot: l.modifiersSnapshot ?? null,
      }))
      if (isRepair) {
        return authPatch(`/invoices/${invoice.id}`, { lines })
      }
      return authPost(`/invoices/${invoice.id}/edit`, {
        reasonAr: reasonAr.trim(),
        reasonEn: reasonEn.trim() || undefined,
        lines,
      })
    },
    onSuccess: (data) => {
      if (isRepair) {
        toast.success(t('repairSuccess'))
        router.push(`/invoices/${invoice.id}`)
        router.refresh()
        return
      }
      if (data?.note && data?.documentNature) {
        setCreatedNote({
          documentNature: data.documentNature,
          note: data.note,
        })
        toast.success(t('editSuccess'))
      } else {
        toast.error(tErr('generic'))
      }
    },
    onError: (err) => {
      const code = err instanceof AuthApiError ? err.code : undefined
      if (code === 'EDIT_NO_CHANGE') {
        setFormError(t('editNoChange'))
        return
      }
      setFormError(code ? tErr(code) : tErr('generic'))
    },
  })

  const printMutation = useMutation({
    mutationFn: () => {
      if (!createdNote?.note?.id) {
        throw new AuthApiError(400, 'VALIDATION_ERROR', 'Missing note')
      }
      return printDocument({
        noteId: String(createdNote.note.id),
        noteType: createdNote.documentNature,
        invoice: createdNote.note,
        logoUrl,
      })
    },
    onSuccess: (data) => {
      toastPrintResult(t, data)
      closeNoteModal()
    },
    onError: (err) => {
      toastPrintError(err)
    },
  })

  function itemDisplayName(item) {
    return locale === 'ar'
      ? item.nameAr
      : item.nameEn?.trim() || item.nameAr
  }

  function categoryDisplayName(cat) {
    return locale === 'ar'
      ? cat.nameAr
      : cat.nameEn?.trim() || cat.nameAr
  }

  function lineDisplayName(line) {
    return locale === 'ar'
      ? line.nameAr
      : line.nameEn?.trim() || line.nameAr
  }

  function commitNewMenuLine(item, payload) {
    const key = cartLineKey(
      item.id,
      payload.variantOptionIds,
      payload.customizationIds,
    )
    const snapshot = buildModifiersSnapshotFromItem(
      item,
      payload.variantOptionIds,
      payload.customizationIds,
    )
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.key === key)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = {
          ...next[idx],
          quantity: Math.min(999, next[idx].quantity + 1),
          imageUrl: next[idx].imageUrl || item.imageUrl || null,
        }
        return next
      }
      return [
        ...prev,
        {
          key,
          menuItemId: item.id,
          nameAr: item.nameAr,
          nameEn: item.nameEn,
          quantity: 1,
          unitPrice: payload.unitPrice,
          vatPreset: item.vatPreset,
          imageUrl: item.imageUrl,
          lineNote: null,
          modifiersSnapshot: snapshot,
        },
      ]
    })
    setConfiguratorItem(null)
  }

  function addToCart(item) {
    if (menuItemHasVariantGroups(item) || menuItemHasCustomizations(item)) {
      setConfiguratorItem(item)
      return
    }
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.menuItemId === item.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = {
          ...next[idx],
          quantity: Math.min(999, next[idx].quantity + 1),
          imageUrl: next[idx].imageUrl || item.imageUrl || null,
        }
        return next
      }
      return [
        ...prev,
        {
          key: `new-${item.id}`,
          menuItemId: item.id,
          nameAr: item.nameAr,
          nameEn: item.nameEn,
          quantity: 1,
          unitPrice: String(item.price),
          vatPreset: item.vatPreset,
          imageUrl: item.imageUrl,
          lineNote: null,
          modifiersSnapshot: null,
        },
      ]
    })
  }

  function setQty(key, quantity) {
    setCart((prev) => {
      if (quantity <= 0) return prev.filter((l) => l.key !== key)
      return prev.map((l) =>
        l.key === key ? { ...l, quantity: Math.min(999, quantity) } : l,
      )
    })
  }

  function removeLine(key) {
    setCart((prev) => prev.filter((l) => l.key !== key))
  }

  function handleSubmit(e) {
    e.preventDefault()
    setFormError('')
    if (!isRepair && !reasonAr.trim()) {
      setFieldErrors({ reasonAr: t('editReasonRequired') })
      scrollAfterFieldValidation()
      return
    }
    setFieldErrors({ reasonAr: '' })
    if (cart.length === 0) {
      setFormError(tErr('VALIDATION_ERROR'))
      return
    }
    editMutation.mutate()
  }

  function closeNoteModal() {
    setCreatedNote(null)
    router.push(`/invoices/${invoice.id}`)
  }

  const documentLabel =
    createdNote?.documentNature === 'credit'
      ? t('noteTypeCredit')
      : createdNote?.documentNature === 'debit'
        ? t('noteTypeDebit')
        : null

  const canSubmit = isRepair
    ? cart.length > 0 &&
      !editMutation.isPending &&
      parseMoney(cartTotals.grandTotal) > 0
    : cart.length > 0 &&
      !editMutation.isPending &&
      Math.abs(
        parseMoney(cartTotals.grandTotal) -
          parseMoney(originalTotals.grandTotal),
      ) >= 0.01

  return (
    <div className="mx-auto max-w-hisabi-container">
      <PageBackButton
        href={`/invoices/${invoice.id}`}
        label={t('backToInvoice')}
      />

      <div className="mb-hisabi-xl space-y-1">
        <h1 className="type-headline-xl text-hisabi-on-surface">
          {isRepair
            ? t('repairTitle', { number: invoice.invoiceNumber })
            : t('editTitle', { number: invoice.invoiceNumber })}
        </h1>
        {invoice.orderNumber ? (
          <p className="type-label-md font-bold text-hisabi-teal" dir="ltr">
            {t('orderNumberLabel', {
              number: formatOrderNumber(invoice.orderNumber),
            })}
          </p>
        ) : null}
        <p className="type-body-md text-hisabi-on-surface-variant">
          {isRepair ? t('repairSubtitle') : t('editSubtitle')}
        </p>
      </div>

      <div className="mb-hisabi-xl flex flex-col gap-hisabi-lg lg:flex-row lg:items-start">
        <section className="min-w-0 flex-1 space-y-hisabi-md">
          <div className="flex gap-hisabi-sm overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              onClick={() => setCategoryId('all')}
              className={cn(
                'type-label-sm shrink-0 cursor-pointer rounded-xl px-hisabi-md py-2 font-bold transition-colors',
                categoryId === 'all'
                  ? 'bg-hisabi-primary-container text-white'
                  : 'bg-hisabi-surface-container-lowest text-hisabi-on-surface-variant hover:bg-hisabi-surface-container',
              )}
            >
              {tPos('allCategories')}
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryId(cat.id)}
                className={cn(
                  'type-label-sm shrink-0 cursor-pointer rounded-xl px-hisabi-md py-2 font-bold transition-colors',
                  categoryId === cat.id
                    ? 'bg-hisabi-primary-container text-white'
                    : 'bg-hisabi-surface-container-lowest text-hisabi-on-surface-variant hover:bg-hisabi-surface-container',
                )}
              >
                {categoryDisplayName(cat)}
              </button>
            ))}
          </div>

          {filteredItems.length === 0 ? (
            <p className="type-body-md text-hisabi-on-surface-variant py-hisabi-xl text-center">
              {menuItems.length === 0 ? tPos('emptyMenu') : tPos('emptyCategory')}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-hisabi-sm sm:grid-cols-3 xl:grid-cols-4">
              {filteredItems.map((item) => {
                const name = itemDisplayName(item)
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => addToCart(item)}
                    className="group flex cursor-pointer flex-col overflow-hidden rounded-xl border border-hisabi-outline-variant/30 bg-hisabi-surface-container-lowest text-start shadow-sm transition-all hover:border-hisabi-primary/40 hover:shadow-md active:scale-[0.98]"
                  >
                    <div className="bg-hisabi-surface-container-high text-hisabi-primary relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden text-lg font-bold">
                      {item.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- authenticated menu image
                        <img
                          src={item.imageUrl}
                          alt=""
                          className="absolute inset-0 size-full object-cover"
                        />
                      ) : (
                        name.slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-1 p-hisabi-md">
                      <span className="type-body-md line-clamp-2 pb-0.5 font-bold leading-normal text-hisabi-on-surface">
                        {name}
                      </span>
                      <span
                        dir="ltr"
                        className="type-body-sm font-medium text-hisabi-teal"
                      >
                        {item.price}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </section>

        <aside className="border-hisabi-outline-variant/30 flex w-full shrink-0 flex-col overflow-hidden rounded-xl border bg-hisabi-surface-container-lowest shadow-sm lg:w-[400px] lg:sticky lg:top-[4.5rem] lg:max-h-[calc(100dvh-5.5rem)]">
          <div className="flex items-center gap-hisabi-sm border-b border-hisabi-outline-variant/20 px-hisabi-lg py-hisabi-md">
            <ShoppingCart className="size-5 text-hisabi-primary" aria-hidden />
            <h2 className="type-headline-md font-bold text-hisabi-primary">
              {tPos('cartTitle')}
            </h2>
          </div>

          <form
            id="invoice-edit-form"
            onSubmit={handleSubmit}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="flex-1 space-y-hisabi-sm overflow-y-auto px-hisabi-md py-hisabi-md">
              {cart.length === 0 ? (
                <p className="type-body-md text-hisabi-on-surface-variant py-hisabi-xl text-center">
                  {tPos('emptyCart')}
                </p>
              ) : (
                cart.map((line, idx) => {
                  const lineTotal =
                    cartTotals.perLine[idx]?.lineTotalStr ??
                    decimalStringFromNumber(
                      parseMoney(line.unitPrice) * line.quantity,
                    )
                  return (
                    <div
                      key={line.key}
                      className="flex items-stretch gap-hisabi-sm rounded-lg bg-hisabi-surface-container-low/60 px-hisabi-sm py-hisabi-sm"
                    >
                      <div className="bg-hisabi-surface-container-high text-hisabi-primary relative flex w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg text-sm font-bold self-stretch min-h-[4rem]">
                        {line.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- authenticated menu image
                          <img
                            src={line.imageUrl}
                            alt=""
                            className="absolute inset-0 size-full object-cover"
                          />
                        ) : (
                          lineDisplayName(line).slice(0, 2).toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="type-label-md truncate font-bold text-hisabi-on-surface">
                          {lineDisplayName(line)}
                        </p>
                        <LineModifierSummary
                          snapshot={line.modifiersSnapshot}
                          locale={locale}
                        />
                        <p
                          dir="ltr"
                          className="type-body-sm text-hisabi-on-surface-variant"
                        >
                          {line.unitPrice} × {line.quantity}
                        </p>
                        <div className="mt-hisabi-xs flex items-center gap-1">
                          <button
                            type="button"
                            aria-label={tPos('qtyDecrease')}
                            onClick={() => setQty(line.key, line.quantity - 1)}
                            className="flex size-8 cursor-pointer items-center justify-center rounded-lg border border-hisabi-outline-variant/50 bg-white text-hisabi-on-surface transition-colors hover:bg-hisabi-surface-container"
                          >
                            <Minus className="size-4" aria-hidden />
                          </button>
                          <span
                            dir="ltr"
                            className="type-label-md w-8 text-center font-bold"
                          >
                            {line.quantity}
                          </span>
                          <button
                            type="button"
                            aria-label={tPos('qtyIncrease')}
                            onClick={() => setQty(line.key, line.quantity + 1)}
                            className="flex size-8 cursor-pointer items-center justify-center rounded-lg border border-hisabi-outline-variant/50 bg-white text-hisabi-on-surface transition-colors hover:bg-hisabi-surface-container"
                          >
                            <Plus className="size-4" aria-hidden />
                          </button>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end justify-between self-stretch">
                        <span
                          dir="ltr"
                          className="type-label-md font-bold text-hisabi-on-surface"
                        >
                          {lineTotal}
                        </span>
                        <button
                          type="button"
                          aria-label={tPos('removeLine')}
                          onClick={() => removeLine(line.key)}
                          className="text-hisabi-error hover:bg-hisabi-error/8 flex size-8 cursor-pointer items-center justify-center rounded-lg transition-colors"
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </button>
                      </div>
                    </div>
                  )
                })
              )}

              {!isRepair ? (
                <>
                  <div className="space-y-hisabi-xs pt-hisabi-sm">
                    <label
                      htmlFor="edit-reason-ar"
                      className="type-label-md text-hisabi-on-surface-variant flex items-center gap-2"
                    >
                      {t('editReasonArLabel')}
                      <RequiredMark />
                      {loadingReasonAr ? (
                        <HisabiSpinner size="inline" className="text-hisabi-teal" label={tBi('translating')} />
                      ) : null}
                    </label>
                    <textarea
                      id="edit-reason-ar"
                      rows={3}
                      maxLength={500}
                      value={reasonAr}
                      onChange={(e) => {
                        const next = e.target.value.slice(0, 500)
                        reportUserInput('ar', REASON_PAIR_KEY, {
                          otherFieldEmpty: !reasonEn.trim(),
                        })
                        setReasonAr(next)
                        setFieldErrors((prev) =>
                          prev.reasonAr ? { ...prev, reasonAr: '' } : prev,
                        )
                      }}
                      placeholder={t('editReasonArPlaceholder')}
                      className={cn(
                        fieldClass,
                        fieldErrors.reasonAr &&
                          'border-hisabi-error focus:border-hisabi-error focus:ring-hisabi-error/25',
                      )}
                      dir="rtl"
                      required
                      aria-invalid={fieldErrors.reasonAr ? true : undefined}
                      aria-describedby={
                        fieldErrors.reasonAr ? 'edit-reason-ar-error' : undefined
                      }
                    />
                    {fieldErrors.reasonAr ? (
                      <p
                        id="edit-reason-ar-error"
                        className="type-body-sm text-hisabi-error"
                        role="alert"
                      >
                        {fieldErrors.reasonAr}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-hisabi-xs">
                    <label
                      htmlFor="edit-reason-en"
                      className="type-label-md text-hisabi-on-surface-variant flex items-center gap-2"
                    >
                      {t('editReasonEnLabel')}
                      {loadingReasonEn ? (
                        <HisabiSpinner size="inline" className="text-hisabi-teal" label={tBi('translating')} />
                      ) : null}
                    </label>
                    <textarea
                      id="edit-reason-en"
                      rows={3}
                      maxLength={500}
                      value={reasonEn}
                      onChange={(e) => {
                        const next = e.target.value.slice(0, 500)
                        reportUserInput('en', REASON_PAIR_KEY, {
                          otherFieldEmpty: !reasonAr.trim(),
                        })
                        setReasonEn(next)
                      }}
                      placeholder={t('editReasonEnPlaceholder')}
                      className={fieldClass}
                      dir="ltr"
                    />
                  </div>
                </>
              ) : null}

              {formError ? (
                <p className="type-body-sm text-hisabi-error" role="alert">
                  {formError}
                </p>
              ) : null}
            </div>

            <div className="space-y-hisabi-md border-t border-hisabi-outline-variant/20 px-hisabi-lg py-hisabi-md">
              <div className="space-y-1">
                <div className="type-body-sm flex justify-between text-hisabi-on-surface-variant">
                  <span>{t('subtotal')}</span>
                  <span dir="ltr">{cartTotals.subtotal}</span>
                </div>
                <div className="type-body-sm flex justify-between text-hisabi-on-surface-variant">
                  <span>{t('vat')}</span>
                  <span dir="ltr">{cartTotals.totalVat}</span>
                </div>
                <div className="type-label-md flex justify-between font-bold text-hisabi-on-surface">
                  <span>{t('grandTotal')}</span>
                  <span dir="ltr">{cartTotals.grandTotal}</span>
                </div>
                {!isRepair ? (
                  <div className="type-body-sm flex justify-between text-hisabi-on-surface-variant">
                    <span>{t('editOriginalTotal')}</span>
                    <span dir="ltr">{originalTotals.grandTotal}</span>
                  </div>
                ) : null}
              </div>

              <AuthSubmitButton
                type="submit"
                form="invoice-edit-form"
                pending={editMutation.isPending}
                disabled={!canSubmit}
              >
                {isRepair ? t('repairSubmit') : t('editSubmit')}
              </AuthSubmitButton>
            </div>
          </form>
        </aside>
      </div>

      <PosItemModifiersFlow
        open={Boolean(configuratorItem)}
        item={configuratorItem}
        locale={locale}
        mode="add"
        onClose={() => setConfiguratorItem(null)}
        onConfirm={(payload) => {
          if (!configuratorItem) return
          commitNewMenuLine(configuratorItem, payload)
        }}
      />

      {createdNote ? (
        <HisabiOverlayModal
          open
          onOpenChange={(next) => {
            if (!next) closeNoteModal()
          }}
          variant="success"
          title={t('editSuccess')}
          description={t('receiptPreviewHint')}
          closeLabel={t('close')}
          panelClassName="max-w-[22rem]"
          footer={
            <>
              {typeof createdNote.note.qrCode === 'string' &&
              createdNote.note.qrCode ? (
                <AuthSubmitButton
                  type="button"
                  pending={printMutation.isPending}
                  onClick={() => printMutation.mutate()}
                >
                  {receiptActionLabel(tPos, desktop)}
                </AuthSubmitButton>
              ) : (
                <p className="type-body-sm text-hisabi-on-surface-variant text-center">
                  {t('printBlockedNoQr')}
                </p>
              )}
              <AuthSubmitButton
                type="button"
                variant="secondary"
                onClick={closeNoteModal}
              >
                {t('backToInvoice')}
              </AuthSubmitButton>
            </>
          }
        >
          <PosThermalReceiptPreview
            invoice={/** @type {any} */ (createdNote.note)}
            logoUrl={logoUrl}
            documentLabel={documentLabel}
          />
        </HisabiOverlayModal>
      ) : null}
    </div>
  )
}
