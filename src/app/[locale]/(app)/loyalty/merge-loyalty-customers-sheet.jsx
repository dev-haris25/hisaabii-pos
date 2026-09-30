'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { AuthSubmitButton } from '@/components/auth/auth-submit-button'
import { HisabiStatusModal } from '@/components/hisabi-status-modal'
import { SearchableEntityPicker } from '@/components/invoices/searchable-entity-picker'
import {
  HisabiSheet,
  HISABI_SHEET_FOOTER_CANCEL_CLASS,
  HISABI_SHEET_FOOTER_SAVE_CLASS,
} from '@/components/shared/hisabi-sheet'
import { AuthApiError, authGet, authPost } from '@/lib/api/auth-client'
import { parseMoney } from '@/lib/invoices/invoice-compute-totals'
import { cn } from '@/lib/utils'

const SEGMENT_SHELL =
  'flex w-full rounded-lg border border-hisabi-outline-variant/60 bg-white p-1'

/**
 * Merge sheet: pick survivor vs duplicate role for the source account,
 * choose the other account, preview balances, then confirm.
 *
 * @param {{
 *   open: boolean
 *   onOpenChange: (open: boolean) => void
 *   sourceCustomer: { id: string, phone?: string, balance?: string } | null
 *   onSuccess?: (opts: {
 *     survivor: Record<string, unknown>
 *     sourceWasDuplicate: boolean
 *   }) => void
 * }} props
 */
export function MergeLoyaltyCustomersSheet({
  open,
  onOpenChange,
  sourceCustomer,
  onSuccess,
}) {
  const t = useTranslations('Loyalty')
  const tErr = useTranslations('AuthErrors')

  /** @type {'survivor' | 'duplicate'} */
  const [sourceRole, setSourceRole] = useState(
    /** @type {'survivor' | 'duplicate'} */ ('duplicate'),
  )
  const [otherId, setOtherId] = useState('')
  const [formError, setFormError] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [merging, setMerging] = useState(false)

  const sourceId = sourceCustomer?.id ? String(sourceCustomer.id) : ''

  const { data: customersRes, isLoading: customersLoading } = useQuery({
    queryKey: ['loyalty-customers-picker'],
    queryFn: async () => authGet('/loyalty/customers'),
    enabled: open,
    staleTime: 30_000,
  })

  const pickerItems = useMemo(() => {
    const rows = Array.isArray(customersRes?.customers)
      ? customersRes.customers
      : []
    return rows
      .filter((row) => String(row.id) !== sourceId)
      .map((row) => ({
        id: String(row.id),
        label: String(row.phone ?? ''),
        sublabel: t('mergePickerBalance', {
          balance: String(row.balance ?? '0'),
        }),
      }))
  }, [customersRes?.customers, sourceId, t])

  const otherCustomer = useMemo(() => {
    const rows = Array.isArray(customersRes?.customers)
      ? customersRes.customers
      : []
    return rows.find((row) => String(row.id) === otherId) ?? null
  }, [customersRes?.customers, otherId])

  useEffect(() => {
    if (!open) return
    setSourceRole('duplicate')
    setOtherId('')
    setFormError('')
    setConfirmOpen(false)
  }, [open, sourceId])

  const survivor =
    sourceRole === 'survivor' ? sourceCustomer : otherCustomer
  const duplicate =
    sourceRole === 'duplicate' ? sourceCustomer : otherCustomer

  const survivorBalance = String(survivor?.balance ?? '0')
  const duplicateBalance = String(duplicate?.balance ?? '0')
  const combinedPreview = (
    parseMoney(survivorBalance) + parseMoney(duplicateBalance)
  ).toFixed(2)

  const previewReady = Boolean(survivor?.id && duplicate?.id)

  function handleContinue() {
    setFormError('')
    if (!otherId) {
      setFormError(t('mergeOtherRequired'))
      return
    }
    if (!previewReady) {
      setFormError(tErr('LOYALTY_ACCOUNT_NOT_FOUND'))
      return
    }
    if (String(survivor?.id) === String(duplicate?.id)) {
      setFormError(tErr('LOYALTY_MERGE_SAME_ACCOUNT'))
      return
    }
    setConfirmOpen(true)
  }

  async function handleConfirmMerge() {
    if (!survivor?.id || !duplicate?.id || merging) return
    setMerging(true)
    try {
      const res = await authPost('/loyalty/customers/merge', {
        survivorAccountId: String(survivor.id),
        duplicateAccountId: String(duplicate.id),
      })
      toast.success(t('mergeSuccess'))
      setConfirmOpen(false)
      onOpenChange(false)
      onSuccess?.({
        survivor: res?.customer ?? survivor,
        sourceWasDuplicate: sourceRole === 'duplicate',
      })
    } catch (err) {
      const code = err instanceof AuthApiError ? err.code : undefined
      const message = code ? tErr(code) : tErr('generic')
      setConfirmOpen(false)
      setFormError(message)
    } finally {
      setMerging(false)
    }
  }

  return (
    <>
      <HisabiSheet
        open={open}
        onOpenChange={(next) => {
          if (!next) setConfirmOpen(false)
          onOpenChange(next)
        }}
        title={t('mergeSheetTitle')}
        description={t('mergeSheetSubtitle')}
        closeLabel={t('cancel')}
        footer={
          <>
            <button
              type="button"
              className={HISABI_SHEET_FOOTER_CANCEL_CLASS}
              disabled={merging}
              onClick={() => onOpenChange(false)}
            >
              {t('cancel')}
            </button>
            <AuthSubmitButton
              type="button"
              pending={false}
              disabled={merging || !otherId}
              className={HISABI_SHEET_FOOTER_SAVE_CLASS}
              onClick={handleContinue}
            >
              {t('mergeContinue')}
            </AuthSubmitButton>
          </>
        }
      >
        <div className="space-y-hisabi-lg">
          {formError ? (
            <p className="type-body-md text-hisabi-error" role="alert">
              {formError}
            </p>
          ) : null}

          <div className="rounded-xl border border-hisabi-outline-variant/40 bg-hisabi-surface-container-low/40 p-hisabi-md">
            <p className="type-label-md text-hisabi-on-surface-variant">
              {t('mergeSourceLabel')}
            </p>
            <p
              className="type-body-md mt-1 font-semibold text-hisabi-on-surface"
              dir="ltr"
            >
              {String(sourceCustomer?.phone ?? '—')} ·{' '}
              {t('mergePickerBalance', {
                balance: String(sourceCustomer?.balance ?? '0'),
              })}
            </p>
          </div>

          <fieldset className="min-w-0 space-y-hisabi-xs border-0 p-0">
            <legend className="type-label-md text-hisabi-on-surface-variant mb-hisabi-sm">
              {t('mergeRoleLegend')}
            </legend>
            <div className={SEGMENT_SHELL}>
              {(
                /** @type {const} */ ([
                  ['survivor', 'mergeRoleKeep'],
                  ['duplicate', 'mergeRoleRemove'],
                ])
              ).map(([value, labelKey]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setSourceRole(value)
                    setFormError('')
                  }}
                  className={cn(
                    'type-label-sm flex min-w-0 flex-1 cursor-pointer items-center justify-center rounded-lg px-2 py-2.5 text-center font-bold transition-colors',
                    sourceRole === value
                      ? 'bg-hisabi-primary-container text-white'
                      : 'text-hisabi-on-surface-variant hover:bg-hisabi-surface-container',
                  )}
                >
                  {t(labelKey)}
                </button>
              ))}
            </div>
            <p className="type-body-sm text-hisabi-on-surface-variant">
              {sourceRole === 'survivor'
                ? t('mergeRoleKeepHint')
                : t('mergeRoleRemoveHint')}
            </p>
          </fieldset>

          <div className="min-w-0 space-y-hisabi-xs">
            <label className="type-label-md text-hisabi-on-surface-variant block">
              {t('mergeOtherLabel')}
            </label>
            <SearchableEntityPicker
              items={pickerItems}
              value={otherId}
              onChange={(id) => {
                setOtherId(id)
                setFormError('')
              }}
              emptyLabel={t('mergeOtherEmpty')}
              searchPlaceholder={t('mergeOtherSearch')}
              loading={customersLoading}
              disabled={customersLoading}
            />
          </div>

          {previewReady ? (
            <div className="space-y-hisabi-sm rounded-xl border border-hisabi-outline-variant/40 bg-white p-hisabi-md">
              <p className="type-label-md font-bold text-hisabi-on-surface">
                {t('mergePreviewTitle')}
              </p>
              <p className="type-body-md text-hisabi-on-surface" dir="ltr">
                {t('mergePreviewBody', {
                  duplicatePhone: String(duplicate?.phone ?? ''),
                  duplicateBalance,
                  survivorPhone: String(survivor?.phone ?? ''),
                  survivorBalance,
                  combinedBalance: combinedPreview,
                })}
              </p>
            </div>
          ) : null}
        </div>
      </HisabiSheet>

      <HisabiStatusModal
        open={confirmOpen}
        onOpenChange={(next) => {
          if (!next && !merging) setConfirmOpen(false)
        }}
        variant="warning"
        title={t('mergeConfirmTitle')}
        description={
          previewReady
            ? t('mergeConfirmBody', {
                duplicatePhone: String(duplicate?.phone ?? ''),
                duplicateBalance,
                survivorPhone: String(survivor?.phone ?? ''),
              })
            : undefined
        }
        primaryLabel={t('mergeConfirm')}
        secondaryLabel={t('cancel')}
        primaryPending={merging}
        onPrimary={() => {
          void handleConfirmMerge()
        }}
        onSecondary={() => {
          if (!merging) setConfirmOpen(false)
        }}
      />
    </>
  )
}
