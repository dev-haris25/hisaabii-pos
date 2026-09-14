'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

import { HisabiStatusModal } from '@/components/hisabi-status-modal'
import { authPost } from '@/lib/api/auth-client'
import { toastAuthApiError } from '@/lib/api/toast-auth-api-error'

/**
 * @param {{
 *   open: boolean
 *   onOpenChange: (open: boolean) => void
 *   kind: 'idType' | 'payslipCategory'
 *   onCreated: (item: { id: string, label: string }) => void
 * }} props
 */
export function InlineCreateLookupModal({ open, onOpenChange, kind, onCreated }) {
  const t = useTranslations('HR')
  const [name, setName] = useState('')
  const [type, setType] = useState('earning')
  const [saving, setSaving] = useState(false)

  const config = {
    idType: { path: '/hr/id-types', titleKey: 'addIdType', bodyKey: 'name' },
    payslipCategory: {
      path: '/hr/payslip-categories',
      titleKey: 'addPayslipCategory',
      bodyKey: 'name',
    },
  }[kind]

  useEffect(() => {
    if (!open) {
      setName('')
      setType('earning')
    }
  }, [open])

  async function handleSave() {
    if (!config || !name.trim()) return
    setSaving(true)
    try {
      const body =
        kind === 'payslipCategory'
          ? { name: name.trim(), type, defaultAmount: '0' }
          : { [config.bodyKey]: name.trim() }
      const res = await authPost(config.path, body)
      const created = res.item ?? res.idType ?? res.payslipCategory
      onCreated({
        id: created.id,
        label: created.name ?? created.title ?? name.trim(),
      })
      setName('')
      onOpenChange(false)
    } catch (err) {
      toastAuthApiError(t, err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <HisabiStatusModal
      open={open}
      onOpenChange={onOpenChange}
      variant="warning"
      title={t(config.titleKey)}
      description={
        <div className="space-y-hisabi-md">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('lookupNamePlaceholder')}
            className="type-body-sm w-full rounded-lg border border-hisabi-outline-variant px-hisabi-md py-2 outline-none focus:border-hisabi-primary focus:ring-1 focus:ring-hisabi-primary/15"
          />
          {kind === 'payslipCategory' ? (
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="type-body-sm w-full rounded-lg border border-hisabi-outline-variant px-hisabi-md py-2 outline-none focus:border-hisabi-primary focus:ring-1 focus:ring-hisabi-primary/15"
            >
              <option value="earning">{t('payslipCategoryEarning')}</option>
              <option value="deduction">{t('payslipCategoryDeduction')}</option>
            </select>
          ) : null}
        </div>
      }
      primaryLabel={t('save')}
      onPrimary={handleSave}
      primaryPending={saving}
      secondaryLabel={t('cancel')}
    />
  )
}
