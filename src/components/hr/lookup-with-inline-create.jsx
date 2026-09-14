'use client'

import { ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { cn } from '@/lib/utils'

import { InlineCreateLookupModal } from './inline-create-lookup-modal'

const ADD_NEW_VALUE = '__add_new__'

/**
 * @typedef {{ id: string, label: string }} LookupOption
 */

/**
 * @param {{
 *   kind: 'idType' | 'payslipCategory'
 *   value: string
 *   onChange: (id: string) => void
 *   options: LookupOption[]
 *   onOptionCreated?: (item: LookupOption) => void
 *   emptyLabel?: string
 *   selectClass?: string
 *   disabled?: boolean
 *   id?: string
 *   translationNamespace?: 'HR' | 'Finance'
 * }} props
 */
export function LookupWithInlineCreate({
  kind,
  value,
  onChange,
  options,
  onOptionCreated,
  emptyLabel,
  selectClass,
  disabled = false,
  id,
}) {
  const t = useTranslations('HR')
  const [createOpen, setCreateOpen] = useState(false)

  function handleSelectChange(nextValue) {
    if (nextValue === ADD_NEW_VALUE) {
      setCreateOpen(true)
      return
    }
    onChange(nextValue)
  }

  return (
    <>
      <div className="relative">
        <select
          id={id}
          value={value}
          disabled={disabled}
          onChange={(e) => handleSelectChange(e.target.value)}
          className={cn(selectClass, disabled && 'opacity-60')}
        >
          <option value="">{emptyLabel ?? t('selectPlaceholder')}</option>
          {options.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
          <option value={ADD_NEW_VALUE}>{t('addNewOption')}</option>
        </select>
        <ChevronDown
          className="pointer-events-none absolute end-3 top-1/2 size-5 -translate-y-1/2 text-hisabi-on-surface-variant"
          aria-hidden
        />
      </div>

      <InlineCreateLookupModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        kind={kind}
        onCreated={(item) => {
          onOptionCreated?.({ id: item.id, label: item.label })
          onChange(item.id)
        }}
      />
    </>
  )
}
