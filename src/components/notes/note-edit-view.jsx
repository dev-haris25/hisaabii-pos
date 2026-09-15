'use client'

import { useMutation } from '@tanstack/react-query'
import { Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { AuthSubmitButton } from '@/components/auth/auth-submit-button'
import { PageBackButton } from '@/components/shared/page-back-button'
import { RequiredMark } from '@/components/ui/required-mark'
import { useRouter } from '@/i18n/navigation'
import { AuthApiError, authPatch } from '@/lib/api/auth-client'
import {
  computeInvoiceTotals,
  parseMoney,
} from '@/lib/invoices/invoice-compute-totals'
import { scrollAfterFieldValidation } from '@/lib/ui/scroll-first-invalid-field'
import { cn } from '@/lib/utils'

const fieldClass =
  'type-body-md text-hisabi-on-surface placeholder:text-hisabi-outline/70 w-full rounded-lg border border-hisabi-outline-variant bg-hisabi-surface px-hisabi-md py-hisabi-sm outline-none transition-shadow focus:border-hisabi-primary focus:ring-2 focus:ring-hisabi-primary/10'

/**
 * @typedef {{
 *   key: string
 *   nameAr: string
 *   nameEn?: string | null
 *   quantity: number
 *   unitPrice: string
 *   vatPreset: string
 *   menuItemId?: string | null
 *   imageUrl?: string | null
 * }} NoteEditCartLine
 */

/**
 * Repair a failed credit/debit note (mutate reason + lines, then re-report).
 *
 * @param {{
 *   documentNature: 'credit' | 'debit'
 *   note: {
 *     id: string
 *     noteNumber: string
 *     reasonAr: string
 *     reasonEn: string | null
 *     lines: Array<{
 *       id: string
 *       nameAr: string
 *       nameEn: string | null
 *       quantity: number
 *       unitPrice: string
 *       vatPreset?: string
 *     }>
 *   }
 *   cartSeed: NoteEditCartLine[]
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
 * }} props
 */
export function NoteEditView({
  documentNature,
  note,
  cartSeed,
  categories,
  menuItems,
}) {
  const ns = documentNature === 'credit' ? 'CreditNotes' : 'DebitNotes'
  const t = useTranslations(ns)
  const tInv = useTranslations('Invoices')
  const tPos = useTranslations('Pos')
  const tErr = useTranslations('AuthErrors')
  const locale = useLocale()
  const router = useRouter()

  const apiSegment = documentNature === 'credit' ? 'credit-notes' : 'debit-notes'
  const listHref =
    documentNature === 'credit'
      ? '/invoices/credit-notes'
      : '/invoices/debit-notes'
  const detailHref = `${listHref}/${note.id}`

  const [categoryId, setCategoryId] = useState(/** @type {string | 'all'} */ ('all'))
  /** @type {[NoteEditCartLine[], function]} */
  const [cart, setCart] = useState(cartSeed)
  const [reasonAr, setReasonAr] = useState(note.reasonAr || '')
  const [reasonEn, setReasonEn] = useState(note.reasonEn || '')
  const [formError, setFormError] = useState('')
  const [reasonError, setReasonError] = useState('')

  const filteredItems = useMemo(() => {
    if (categoryId === 'all') return menuItems
    return menuItems.filter((item) => item.categoryId === categoryId)
  }, [menuItems, categoryId])

  const cartTotals = useMemo(() => {
    if (cart.length === 0) {
      return {
        subtotal: '0.00',
        totalVat: '0.00',
        grandTotal: '0.00',
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

  const saveMutation = useMutation({
    mutationFn: () =>
      authPatch(`/${apiSegment}/${note.id}`, {
        reasonAr: reasonAr.trim(),
        reasonEn: reasonEn.trim() || undefined,
        lines: cart.map((l) => ({
          nameAr: l.nameAr,
          nameEn: l.nameEn ?? undefined,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          vatPreset: l.vatPreset,
        })),
      }),
    onSuccess: () => {
      toast.success(t('repairSuccess'))
      router.push(detailHref)
      router.refresh()
    },
    onError: (err) => {
      const code = err instanceof AuthApiError ? err.code : undefined
      setFormError(code ? tErr(code) : tErr('generic'))
    },
  })

  function itemDisplayName(item) {
    return locale === 'ar' ? item.nameAr : item.nameEn?.trim() || item.nameAr
  }

  function categoryDisplayName(cat) {
    return locale === 'ar' ? cat.nameAr : cat.nameEn?.trim() || cat.nameAr
  }

  function lineDisplayName(line) {
    return locale === 'ar' ? line.nameAr : line.nameEn?.trim() || line.nameAr
  }

  function addToCart(item) {
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.menuItemId === item.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = {
          ...next[idx],
          quantity: Math.min(999, next[idx].quantity + 1),
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
    if (!reasonAr.trim()) {
      setReasonError(tInv('editReasonRequired'))
      scrollAfterFieldValidation()
      return
    }
    setReasonError('')
    if (cart.length === 0 || parseMoney(cartTotals.grandTotal) <= 0) {
      setFormError(tErr('VALIDATION_ERROR'))
      return
    }
    saveMutation.mutate()
  }

  const canSubmit =
    cart.length > 0 &&
    reasonAr.trim() &&
    parseMoney(cartTotals.grandTotal) > 0 &&
    !saveMutation.isPending

  return (
    <div className="mx-auto max-w-hisabi-container">
      <PageBackButton href={detailHref} label={t('backToDetail')} />

      <div className="mb-hisabi-xl space-y-1">
        <h1 className="type-headline-xl text-hisabi-on-surface">
          {t('repairTitle', { number: note.noteNumber })}
        </h1>
        <p className="type-body-md text-hisabi-on-surface-variant">
          {t('repairSubtitle')}
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

          <div className="grid grid-cols-2 gap-hisabi-sm sm:grid-cols-3 md:grid-cols-4">
            {filteredItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => addToCart(item)}
                className="flex cursor-pointer flex-col gap-2 rounded-xl border border-hisabi-outline-variant/40 bg-white p-hisabi-md text-start transition-colors hover:border-hisabi-primary/40 hover:bg-hisabi-surface-container-low"
              >
                <span className="type-label-md font-bold text-hisabi-on-surface line-clamp-2">
                  {itemDisplayName(item)}
                </span>
                <span dir="ltr" className="type-body-sm text-hisabi-on-surface-variant">
                  {item.price}
                </span>
              </button>
            ))}
          </div>
        </section>

        <aside className="w-full shrink-0 lg:w-[22rem]">
          <form
            id="note-edit-form"
            onSubmit={handleSubmit}
            className="overflow-hidden rounded-xl border border-hisabi-outline-variant/30 bg-white shadow-sm"
          >
            <div className="border-b border-hisabi-outline-variant/20 px-hisabi-lg py-hisabi-md">
              <div className="flex items-center gap-hisabi-sm">
                <ShoppingCart className="size-5 text-hisabi-primary" aria-hidden />
                <h2 className="type-title-md font-bold text-hisabi-on-surface">
                  {t('repairCartTitle')}
                </h2>
              </div>
            </div>

            <div className="max-h-[28rem] space-y-hisabi-sm overflow-y-auto px-hisabi-lg py-hisabi-md">
              {cart.length === 0 ? (
                <p className="type-body-sm text-hisabi-on-surface-variant py-hisabi-lg text-center">
                  {tPos('emptyCart')}
                </p>
              ) : (
                cart.map((line) => (
                  <div
                    key={line.key}
                    className="flex items-start justify-between gap-hisabi-sm rounded-lg bg-hisabi-surface-container-low px-hisabi-md py-hisabi-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="type-label-md font-bold text-hisabi-on-surface line-clamp-2">
                        {lineDisplayName(line)}
                      </p>
                      <p dir="ltr" className="type-body-sm text-hisabi-on-surface-variant">
                        {line.unitPrice}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label={tPos('qtyDecrease')}
                        onClick={() => setQty(line.key, line.quantity - 1)}
                        className="flex size-8 cursor-pointer items-center justify-center rounded-lg hover:bg-white"
                      >
                        <Minus className="size-4" aria-hidden />
                      </button>
                      <span dir="ltr" className="type-label-md w-6 text-center font-bold">
                        {line.quantity}
                      </span>
                      <button
                        type="button"
                        aria-label={tPos('qtyIncrease')}
                        onClick={() => setQty(line.key, line.quantity + 1)}
                        className="flex size-8 cursor-pointer items-center justify-center rounded-lg hover:bg-white"
                      >
                        <Plus className="size-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        aria-label={tPos('removeLine')}
                        onClick={() => removeLine(line.key)}
                        className="text-hisabi-error hover:bg-hisabi-error/8 flex size-8 cursor-pointer items-center justify-center rounded-lg"
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </div>
                  </div>
                ))
              )}

              <div className="space-y-hisabi-xs pt-hisabi-sm">
                <label
                  htmlFor="note-reason-ar"
                  className="type-label-md text-hisabi-on-surface-variant block"
                >
                  {tInv('editReasonArLabel')}
                  <RequiredMark />
                </label>
                <textarea
                  id="note-reason-ar"
                  rows={3}
                  maxLength={500}
                  value={reasonAr}
                  onChange={(e) => {
                    setReasonAr(e.target.value)
                    if (reasonError) setReasonError('')
                  }}
                  className={cn(
                    fieldClass,
                    reasonError &&
                      'border-hisabi-error focus:border-hisabi-error focus:ring-hisabi-error/25',
                  )}
                  aria-invalid={reasonError ? true : undefined}
                  aria-describedby={
                    reasonError ? 'note-reason-ar-error' : undefined
                  }
                />
                {reasonError ? (
                  <p
                    id="note-reason-ar-error"
                    className="type-body-sm text-hisabi-error"
                    role="alert"
                  >
                    {reasonError}
                  </p>
                ) : null}
              </div>
              <div className="space-y-hisabi-xs">
                <label
                  htmlFor="note-reason-en"
                  className="type-label-md text-hisabi-on-surface-variant block"
                >
                  {tInv('editReasonEnLabel')}
                </label>
                <textarea
                  id="note-reason-en"
                  rows={2}
                  maxLength={500}
                  value={reasonEn}
                  onChange={(e) => setReasonEn(e.target.value)}
                  className={fieldClass}
                />
              </div>

              {formError ? (
                <p className="type-body-sm text-hisabi-error" role="alert">
                  {formError}
                </p>
              ) : null}
            </div>

            <div className="space-y-hisabi-md border-t border-hisabi-outline-variant/20 px-hisabi-lg py-hisabi-md">
              <div className="space-y-1">
                <div className="type-body-sm flex justify-between text-hisabi-on-surface-variant">
                  <span>{tInv('subtotal')}</span>
                  <span dir="ltr">{cartTotals.subtotal}</span>
                </div>
                <div className="type-body-sm flex justify-between text-hisabi-on-surface-variant">
                  <span>{tInv('vat')}</span>
                  <span dir="ltr">{cartTotals.totalVat}</span>
                </div>
                <div className="type-label-md flex justify-between font-bold text-hisabi-on-surface">
                  <span>{tInv('grandTotal')}</span>
                  <span dir="ltr">{cartTotals.grandTotal}</span>
                </div>
              </div>
              <AuthSubmitButton
                type="submit"
                form="note-edit-form"
                pending={saveMutation.isPending}
                disabled={!canSubmit}
              >
                {t('repairSubmit')}
              </AuthSubmitButton>
            </div>
          </form>
        </aside>
      </div>
    </div>
  )
}
