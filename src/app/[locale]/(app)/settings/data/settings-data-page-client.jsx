'use client'

import { useQuery } from '@tanstack/react-query'
import { BarChart3, Download, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import { useAppAbility } from '@/components/rbac/ability-provider'
import {
  SettingsPageShell,
  SettingsSection,
} from '@/components/settings/settings-page-shell'
import { AuthApiError, authGet, authGetBlob } from '@/lib/api/auth-client'
import { hasFullAccess } from '@/lib/rbac/ability-utils'
import { cn } from '@/lib/utils'

const EXPORTS = [
  { entity: 'menuItems', labelKey: 'exportMenuItems', subject: 'MenuItem' },
  {
    entity: 'menuCategories',
    labelKey: 'exportMenuCategories',
    subject: 'MenuCategory',
  },
  { entity: 'invoices', labelKey: 'exportInvoices', subject: 'Invoice' },
  {
    entity: 'creditNotes',
    labelKey: 'exportCreditNotes',
    subject: 'CreditNote',
  },
  { entity: 'debitNotes', labelKey: 'exportDebitNotes', subject: 'DebitNote' },
  { entity: 'employees', labelKey: 'exportEmployees', subject: 'Employee' },
  {
    entity: 'salarySlips',
    labelKey: 'exportSalarySlips',
    subject: 'SalarySlip',
  },
]

const COUNT_KEYS = [
  ['countMenuItems', 'menuItems'],
  ['countMenuCategories', 'menuCategories'],
  ['countInvoices', 'invoices'],
  ['countCreditNotes', 'creditNotes'],
  ['countDebitNotes', 'debitNotes'],
  ['countEmployees', 'employees'],
  ['countSalarySlips', 'salarySlips'],
]

export function SettingsDataPageClient() {
  const t = useTranslations('Settings')
  const ability = useAppAbility()
  const canRead =
    hasFullAccess(ability) || ability.can('read', 'BusinessSettings')
  const [exporting, setExporting] = useState(/** @type {string | null} */ (null))

  const { data: summary, isPending, isError, error } = useQuery({
    queryKey: ['settings-data-summary'],
    queryFn: () => authGet('/settings/data-summary'),
    enabled: canRead,
  })

  const noCompany =
    isError && error instanceof AuthApiError && error.code === 'NO_COMPANY'

  const downloadExport = useCallback(
    async (entity) => {
      setExporting(entity)
      try {
        const { blob, filename } = await authGetBlob(
          `/settings/data-export?entity=${encodeURIComponent(entity)}`,
        )
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename || `hisabi-pos-${entity}.csv`
        a.click()
        URL.revokeObjectURL(url)
      } catch {
        toast.error(t('exportFailed'))
      } finally {
        setExporting(null)
      }
    },
    [t],
  )

  if (!canRead) {
    return (
      <SettingsPageShell title={t('dataTitle')} subtitle={t('dataSubtitle')}>
        <p className="type-body-md text-hisabi-on-surface-variant">
          {t('noPermission')}
        </p>
      </SettingsPageShell>
    )
  }

  if (noCompany) {
    return (
      <SettingsPageShell title={t('dataTitle')} subtitle={t('dataSubtitle')}>
        <p className="type-body-md text-hisabi-on-surface-variant">
          {t('noCompany')}
        </p>
      </SettingsPageShell>
    )
  }

  const counts = summary?.counts

  return (
    <SettingsPageShell title={t('dataTitle')} subtitle={t('dataSubtitle')}>
      <SettingsSection title={t('sectionDataSummary')} icon={BarChart3}>
        {isPending ? (
          <Loader2 className="size-6 animate-spin text-hisabi-primary" />
        ) : (
          <dl className="grid gap-hisabi-sm sm:grid-cols-2 lg:grid-cols-3">
            {COUNT_KEYS.map(([labelKey, countKey]) => (
              <div
                key={countKey}
                className="rounded-lg border border-hisabi-outline-variant/20 bg-hisabi-surface-container-low px-hisabi-md py-hisabi-sm"
              >
                <dt className="type-body-sm text-hisabi-on-surface-variant">
                  {t(labelKey)}
                </dt>
                <dd className="type-title-lg text-hisabi-on-surface font-semibold">
                  {counts?.[countKey] ?? 0}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </SettingsSection>

      <SettingsSection title={t('sectionExport')} icon={Download}>
        <p className="type-body-sm text-hisabi-on-surface-variant">{t('exportHint')}</p>
        <div className="grid gap-hisabi-md sm:grid-cols-2 lg:grid-cols-3">
          {EXPORTS.map((card) => {
            const allowed =
              hasFullAccess(ability) || ability.can('read', card.subject)
            const busy = exporting === card.entity
            return (
              <button
                key={card.entity}
                type="button"
                disabled={!allowed || busy || Boolean(exporting)}
                onClick={() => {
                  if (!allowed) return
                  void downloadExport(card.entity)
                }}
                className={cn(
                  'flex flex-col items-start gap-hisabi-sm rounded-xl border border-hisabi-outline-variant/30 bg-hisabi-surface-container-low p-hisabi-md text-start transition-colors',
                  allowed
                    ? 'hover:border-hisabi-primary/40 hover:bg-hisabi-surface-container-lowest'
                    : 'cursor-not-allowed opacity-50',
                )}
              >
                {busy ? (
                  <Loader2 className="size-5 animate-spin text-hisabi-primary" />
                ) : (
                  <Download className="size-5 text-hisabi-primary" />
                )}
                <span className="type-label-md text-hisabi-on-surface font-medium">
                  {t(card.labelKey)}
                </span>
              </button>
            )
          })}
        </div>
      </SettingsSection>
    </SettingsPageShell>
  )
}
