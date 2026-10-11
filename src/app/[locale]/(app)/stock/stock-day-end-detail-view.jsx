'use client'

import { Sparkles } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { AuthSubmitButton } from '@/components/auth/auth-submit-button'
import { useAppAbility } from '@/components/rbac/ability-provider'
import { SettingsSection } from '@/components/settings/settings-page-shell'
import { PageBackButton } from '@/components/shared/page-back-button'
import { WasteSeverityBadge } from '@/components/stock/waste-severity-badge'
import { AuthApiError, authPatch } from '@/lib/api/auth-client'
import {
  LIST_TABLE_BASE,
  LIST_TABLE_BODY,
  LIST_TABLE_HEAD_ROW,
  LIST_TABLE_ROW,
  LIST_TABLE_SCROLL_WRAP,
  listTableTdClass,
  listTableThClass,
} from '@/lib/list-views/list-table-styles'
import { stockUnitLabel } from '@/lib/stock/units'
import { cn } from '@/lib/utils'

function itemLabel(line, locale) {
  if (locale === 'ar') return line.nameAr || line.nameEn || '—'
  return line.nameEn || line.nameAr || '—'
}

function splitAnalysis(raw) {
  const text = String(raw ?? '').trim()
  if (!text) return { en: '', ar: '' }
  const marker = '<<<AR>>>'
  const idx = text.indexOf(marker)
  if (idx >= 0) {
    return {
      en: text.slice(0, idx).trim(),
      ar: text.slice(idx + marker.length).trim(),
    }
  }
  const parts = text
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length < 2) return { en: text, ar: '' }
  return { en: parts[0], ar: parts.slice(1).join('\n\n') }
}

/**
 * @param {{ report: Record<string, any> }} props
 */
export function StockDayEndDetailView({ report: initial }) {
  const t = useTranslations('Stock')
  const tErr = useTranslations('AuthErrors')
  const locale = useLocale()
  const ability = useAppAbility()
  const canUpdate = ability.can('update', 'StockItem')
  const [report, setReport] = useState(initial)
  const [usedById, setUsedById] = useState(() => {
    /** @type {Record<string, string>} */
    const next = {}
    for (const line of initial.lines ?? []) {
      next[line.id] = line.userUsed ?? line.recipeUsed ?? ''
    }
    return next
  })
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const lines = report.lines ?? []

  const payloadLines = useMemo(
    () =>
      lines.map((line) => ({
        id: line.id,
        userUsed: String(usedById[line.id] ?? '').trim() || null,
      })),
    [lines, usedById],
  )

  /** @param {unknown} err */
  function saveErrorMessage(err) {
    const code = err instanceof AuthApiError ? err.code : undefined
    const message = code && tErr.has(code) ? tErr(code) : t('dayEndSaveFailed')
    const details = err instanceof AuthApiError ? err.details : null
    if (
      (code === 'INSUFFICIENT_STOCK' || code === 'STOCK_ITEM_DELETED') &&
      details &&
      typeof details === 'object' &&
      (details.nameAr || details.nameEn)
    ) {
      return t('dayEndErrorWithItem', { message, item: itemLabel(details, locale) })
    }
    return message
  }

  async function save(submit) {
    if (submit) setSubmitting(true)
    else setSaving(true)
    try {
      const data = await authPatch(`/stock/day-end/${report.id}`, {
        submit,
        lines: payloadLines,
      })
      const next = data?.report
      if (next) {
        setReport(next)
        /** @type {Record<string, string>} */
        const mapped = {}
        for (const line of next.lines ?? []) {
          mapped[line.id] = line.userUsed ?? line.recipeUsed ?? ''
        }
        setUsedById(mapped)
      }
      toast.success(submit ? t('dayEndSubmitted') : t('dayEndSaved'))
    } catch (err) {
      toast.error(saveErrorMessage(err))
    } finally {
      setSaving(false)
      setSubmitting(false)
    }
  }

  const analysis = splitAnalysis(report.aiAnalysis)
  const busy = saving || submitting

  return (
    <div className="mx-auto max-w-hisabi-container space-y-hisabi-xl">
      <PageBackButton href="/stock/day-end" label={t('dayEndBack')} />

      <div className="space-y-1">
        <h1 className="type-headline-xl text-hisabi-on-surface">
          {t('dayEndTitle')}
        </h1>
        <p className="type-body-md text-hisabi-on-surface-variant">
          {report.reportDate} ·{' '}
          {report.status === 'submitted'
            ? t('dayEndStatusSubmitted')
            : t('dayEndStatusDraft')}
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-hisabi-outline-variant/30 bg-white shadow-sm">
        <div className={LIST_TABLE_SCROLL_WRAP}>
          <table className={cn(LIST_TABLE_BASE, 'min-w-[760px]')}>
            <thead>
              <tr className={LIST_TABLE_HEAD_ROW}>
                <th scope="col" className={listTableThClass(undefined, true)}>
                  {t('colName')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('dayEndColUsed')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('wastageColWaste')}
                </th>
                <th scope="col" className={listTableThClass()}>
                  {t('wastageColSeverity')}
                </th>
              </tr>
            </thead>
            <tbody className={LIST_TABLE_BODY}>
              {lines.length === 0 ? (
                <tr className={LIST_TABLE_ROW}>
                  <td className={listTableTdClass()} colSpan={4}>
                    <p className="type-body-md py-hisabi-xl text-center text-hisabi-on-surface-variant">
                      {t('dayEndEmpty')}
                    </p>
                  </td>
                </tr>
              ) : (
                lines.map((line) => {
                  const unit = stockUnitLabel(line.unit)
                  return (
                    <tr key={line.id} className={LIST_TABLE_ROW}>
                      <td className={listTableTdClass(undefined, true)}>
                        <span className="font-semibold text-hisabi-on-surface">
                          {itemLabel(line, locale)}
                        </span>
                        {line.isBulk ? (
                          <p className="type-label-sm text-hisabi-on-surface-variant">
                            {t('dayEndBulkHint')}
                          </p>
                        ) : null}
                      </td>
                      <td className={listTableTdClass()}>
                        {canUpdate ? (
                          <input
                            type="text"
                            inputMode="decimal"
                            disabled={busy}
                            value={usedById[line.id] ?? ''}
                            placeholder={t('dayEndUsedPlaceholder')}
                            onChange={(e) =>
                              setUsedById((prev) => ({
                                ...prev,
                                [line.id]: e.target.value,
                              }))
                            }
                            className="type-body-md w-32 rounded-lg border border-hisabi-outline-variant/40 bg-white px-hisabi-sm py-hisabi-xs text-hisabi-on-surface"
                          />
                        ) : (
                          <span className="tabular-nums">
                            {line.userUsed
                              ? `${line.userUsed} ${unit}`
                              : '—'}
                          </span>
                        )}
                      </td>
                      <td className={cn(listTableTdClass(), 'tabular-nums')}>
                        {`${line.quantityWaste ?? '0'} ${unit}`}
                      </td>
                      <td className={listTableTdClass()}>
                        <WasteSeverityBadge
                          severity={
                            typeof line.wasteSeverity === 'string'
                              ? line.wasteSeverity
                              : null
                          }
                          labels={{
                            low: t('wastageSeverityLow'),
                            bearable: t('wastageSeverityBearable'),
                            high: t('wastageSeverityHigh'),
                          }}
                        />
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {canUpdate ? (
        <div className="flex flex-wrap gap-hisabi-md">
          <AuthSubmitButton
            type="button"
            variant="secondary"
            pending={saving}
            disabled={busy}
            onClick={() => save(false)}
          >
            {t('dayEndSave')}
          </AuthSubmitButton>
          <AuthSubmitButton
            type="button"
            pending={submitting}
            disabled={busy}
            onClick={() => save(true)}
          >
            {t('dayEndSubmit')}
          </AuthSubmitButton>
        </div>
      ) : null}

      <SettingsSection
        title={t('dayEndAnalysis')}
        icon={Sparkles}
      >
        {analysis.en || analysis.ar ? (
          <div className="space-y-hisabi-lg">
            {analysis.en ? (
              <div className="space-y-1">
                <p className="type-label-sm text-hisabi-on-surface-variant">
                  {t('dayEndAnalysisEn')}
                </p>
                <p className="type-body-md whitespace-pre-wrap text-hisabi-on-surface">
                  {analysis.en}
                </p>
              </div>
            ) : null}
            {analysis.ar ? (
              <div className="space-y-1" dir="rtl" lang="ar">
                <p className="type-label-sm text-hisabi-on-surface-variant">
                  {t('dayEndAnalysisAr')}
                </p>
                <p className="type-body-md whitespace-pre-wrap text-start text-hisabi-on-surface">
                  {analysis.ar}
                </p>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="type-body-md text-hisabi-on-surface-variant">
            {t('dayEndAnalysisEmpty')}
          </p>
        )}
      </SettingsSection>
    </div>
  )
}
