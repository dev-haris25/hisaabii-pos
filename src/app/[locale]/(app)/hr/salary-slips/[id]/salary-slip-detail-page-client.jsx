'use client'

import { formatSarAmount } from '@/lib/settings/format-helpers'

import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Download, Loader2, Pencil, Send } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'

import { AuthSubmitButton } from '@/components/auth/auth-submit-button'
import { AppLoader } from '@/components/app-loader'
import { NoCompanyProfileBanner } from '@/components/clients/no-company-profile-banner'
import { SalarySlipDocumentView } from '@/components/hr/salary-slip-document-view'
import { SalarySlipSendSheet } from '@/components/hr/salary-slip-send-sheet'
import { Link } from '@/i18n/navigation'
import { authGet, authPost } from '@/lib/api/auth-client'
import { toastAuthApiError } from '@/lib/api/toast-auth-api-error'
import {
  mapSalarySlipJsonToDocumentModel,
  profileForSalarySlipDocument,
} from '@/lib/hr/salary-slips/map-salary-slip-to-document-model'
import { useAuthStore } from '@/stores/auth-store'

/**
 * @param {{ salarySlipId: string, hasBusinessProfile?: boolean }} props
 */
export function SalarySlipDetailPageClient({ salarySlipId, hasBusinessProfile }) {
  const t = useTranslations('HR')
  const locale = useLocale()
  const docLocale = locale === 'ar' ? 'ar' : 'en'
  const activeBusinessProfileId = useAuthStore(
    (s) => s.user?.activeBusinessProfileId ?? null,
  )

  const [sendSheetOpen, setSendSheetOpen] = useState(false)
  const [downloadPdfPending, setDownloadPdfPending] = useState(false)

  const { data, isPending, isError } = useQuery({
    queryKey: ['hr-salary-slip', salarySlipId],
    queryFn: async () => authGet(`/hr/salary-slips/${salarySlipId}`),
    enabled:
      hasBusinessProfile === true && Boolean(salarySlipId) && Boolean(activeBusinessProfileId),
  })

  const { data: profileData, isPending: profilePending } = useQuery({
    queryKey: ['business-profile', activeBusinessProfileId],
    queryFn: async () => authGet('/business-profile'),
    enabled: hasBusinessProfile === true && Boolean(activeBusinessProfileId),
  })

  const slip = data?.item
  const profile = profileData?.profile

  const documentModel = useMemo(() => {
    if (!slip || !profile) return null
    return mapSalarySlipJsonToDocumentModel(
      slip,
      profileForSalarySlipDocument(profile),
      docLocale,
    )
  }, [slip, profile, docLocale])

  const companyName =
    profile?.companyNameEn?.trim() || profile?.companyNameAr?.trim() || ''

  const formatAmount = (v) => {
    const n = Number.parseFloat(String(v ?? '').replace(/,/g, '')) || 0
    return new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n)
  }

  async function handleSendSalarySlipEmail(payload) {
    try {
      await authPost(`/hr/salary-slips/${salarySlipId}/email`, { ...payload, locale: docLocale })
    } catch (err) {
      toastAuthApiError(t, err)
      throw err
    }
  }

  async function handleDownloadPdf() {
    setDownloadPdfPending(true)
    try {
      const response = await fetch(
        `/api/auth/hr/salary-slips/${salarySlipId}/pdf?locale=${encodeURIComponent(locale)}`,
        { credentials: 'include' },
      )
      if (!response.ok) throw new Error('PDF download failed')
      const contentType = response.headers.get('content-type') ?? ''
      if (!contentType.includes('application/pdf')) throw new Error('Not a PDF')
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${String(slip?.voucherNumber ?? 'salary-slip')}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      toastAuthApiError(t, err)
    } finally {
      setDownloadPdfPending(false)
    }
  }

  if (hasBusinessProfile !== true) {
    return (
      <div className="mx-auto max-w-hisabi-container px-hisabi-md py-hisabi-xl">
        <NoCompanyProfileBanner />
      </div>
    )
  }

  if (isPending || profilePending) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <AppLoader />
      </div>
    )
  }

  if (isError || !slip || !documentModel) {
    return (
      <div className="mx-auto max-w-hisabi-container px-hisabi-md py-hisabi-xl">
        <p className="type-body-md text-hisabi-error">{t('loadError')}</p>
        <Link
          href="/hr/salary-slips"
          className="type-label-md text-hisabi-primary mt-hisabi-md inline-block"
        >
          {t('backToSalarySlips')}
        </Link>
      </div>
    )
  }

  const voucherReference = String(slip.voucherNumber ?? slip.id)
  const defaultEmail = String(slip.employeeEmailOfficial || slip.employeeEmailPersonal || '').trim()

  return (
    <>
      <div className="mx-auto max-w-hisabi-container px-hisabi-md py-hisabi-xl sm:px-hisabi-lg lg:px-hisabi-xl">
        <div className="mb-hisabi-lg flex flex-wrap items-center justify-between gap-hisabi-md">
          <Link
            href="/hr/salary-slips"
            className="type-label-md text-hisabi-primary inline-flex items-center gap-hisabi-sm hover:underline"
          >
            <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
            {t('backToSalarySlips')}
          </Link>
          <Link
            href={`/hr/salary-slips/${salarySlipId}/edit`}
            className="type-label-md border-hisabi-outline-variant text-hisabi-on-surface inline-flex items-center gap-hisabi-sm rounded-lg border px-hisabi-md py-2 font-semibold hover:bg-hisabi-surface-container-low"
          >
            <Pencil className="size-4" aria-hidden />
            {t('edit')}
          </Link>
        </div>

        <div className="mb-hisabi-lg min-w-0">
          <h1 className="type-headline-lg text-hisabi-primary mb-hisabi-xs tracking-tight">
            {t('viewSalarySlipTitle')}
          </h1>
          <p className="type-body-sm text-hisabi-on-surface-variant" dir="ltr">
            {voucherReference}
            {slip.employeeName ? (
              <span className="text-hisabi-on-surface-variant">
                {' '}
                · {slip.employeeName}
              </span>
            ) : null}
          </p>
        </div>

        <SalarySlipDocumentView model={documentModel} className="mb-hisabi-xl" />

        <div className="flex flex-wrap items-center justify-center gap-hisabi-md pb-hisabi-xxl">
          <AuthSubmitButton
            type="button"
            variant="gold"
            className="w-[280px] max-w-full shrink-0"
            onClick={() => setSendSheetOpen(true)}
          >
            <Send className="size-5 shrink-0" aria-hidden />
            {t('actionSendEmail')}
          </AuthSubmitButton>
          <button
            type="button"
            disabled={downloadPdfPending}
            onClick={() => void handleDownloadPdf()}
            className="type-label-md border-hisabi-outline-variant text-hisabi-on-surface inline-flex min-h-[48px] w-[280px] max-w-full items-center justify-center gap-hisabi-sm rounded-xl border px-hisabi-lg py-3 font-semibold hover:bg-hisabi-surface-container-low disabled:opacity-50"
          >
            {downloadPdfPending ? (
              <Loader2 className="size-5 shrink-0 animate-spin" aria-hidden />
            ) : (
              <Download className="size-5 shrink-0" aria-hidden />
            )}
            {t('downloadPdf')}
          </button>
        </div>
      </div>

      <SalarySlipSendSheet
        open={sendSheetOpen}
        onOpenChange={setSendSheetOpen}
        voucherNumber={voucherReference}
        employeeName={String(slip.employeeName ?? '')}
        netPay={formatSarAmount(slip.netTotal, locale)}
        companyName={companyName}
        defaultToEmail={defaultEmail}
        defaultSubject={t('sendSalarySlipSheetDefaultSubject', {
          employee: String(slip.employeeName ?? ''),
          voucher: voucherReference,
        })}
        defaultMessage={t('sendSalarySlipSheetDefaultMessage')}
        onSend={handleSendSalarySlipEmail}
      />
    </>
  )
}
