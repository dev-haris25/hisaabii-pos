'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { AuthSubmitButton } from '@/components/auth/auth-submit-button'
import {
  HISABI_SHEET_FOOTER_CANCEL_CLASS,
  HISABI_SHEET_FOOTER_SAVE_CLASS,
  HisabiSheet,
} from '@/components/shared/hisabi-sheet'
import { RequiredMark } from '@/components/ui/required-mark'
import { AuthApiError, authPost } from '@/lib/api/auth-client'
import { scrollAfterFieldValidation } from '@/lib/ui/scroll-first-invalid-field'
import { cn } from '@/lib/utils'

const fieldClass =
  'type-body-md text-hisabi-on-surface placeholder:text-hisabi-outline/70 w-full rounded-lg border border-hisabi-outline-variant bg-hisabi-surface-container-lowest px-hisabi-md py-3 outline-none transition-shadow focus:border-hisabi-primary focus:ring-1 focus:ring-hisabi-primary/15'

const fieldInvalidClass =
  'border-hisabi-error focus:border-hisabi-error focus:ring-hisabi-error/25'

/**
 * Add table slide-over — same chrome as loyalty / stock sheets.
 *
 * @param {{
 *   open: boolean
 *   onOpenChange: (open: boolean) => void
 *   onSuccess?: () => void
 * }} props
 */
export function AddTableSheet({ open, onOpenChange, onSuccess }) {
  const t = useTranslations('Tables')
  const tErr = useTranslations('AuthErrors')
  const queryClient = useQueryClient()

  const [name, setName] = useState('')
  const [nameError, setNameError] = useState('')
  const [formError, setFormError] = useState('')

  useEffect(() => {
    if (!open) return
    setName('')
    setNameError('')
    setFormError('')
  }, [open])

  const createMutation = useMutation({
    mutationFn: () => authPost('/tables', { name: name.trim() }),
    onSuccess: () => {
      toast.success(t('created'))
      queryClient.invalidateQueries({ queryKey: ['tables'] })
      queryClient.invalidateQueries({ queryKey: ['tables-active-exists'] })
      onOpenChange(false)
      onSuccess?.()
    },
    onError: (err) => {
      const code = err instanceof AuthApiError ? err.code : undefined
      const message = code ? tErr(code) : tErr('generic')
      setFormError(message)
      toast.error(message)
    },
  })

  function handleSubmit(e) {
    e.preventDefault()
    setFormError('')
    const trimmed = name.trim()
    if (!trimmed) {
      setNameError(t('nameRequired'))
      scrollAfterFieldValidation()
      return
    }
    if (createMutation.isPending) return
    setNameError('')
    createMutation.mutate()
  }

  return (
    <HisabiSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('formNewTitle')}
      description={t('formNewSubtitle')}
      closeLabel={t('close')}
      footer={
        <>
          <button
            type="button"
            className={HISABI_SHEET_FOOTER_CANCEL_CLASS}
            disabled={createMutation.isPending}
            onClick={() => onOpenChange(false)}
          >
            {t('cancel')}
          </button>
          <AuthSubmitButton
            type="submit"
            form="add-table-form"
            pending={createMutation.isPending}
            className={HISABI_SHEET_FOOTER_SAVE_CLASS}
          >
            {t('createSubmit')}
          </AuthSubmitButton>
        </>
      }
    >
      <form
        id="add-table-form"
        className="flex flex-col gap-hisabi-md"
        onSubmit={handleSubmit}
        noValidate
      >
        {formError ? (
          <p className="type-body-md text-hisabi-error" role="alert">
            {formError}
          </p>
        ) : null}

        <div className="min-w-0 space-y-hisabi-xs">
          <label
            htmlFor="add-table-name"
            className="type-label-md text-hisabi-on-surface-variant flex items-center gap-1"
          >
            {t('fieldName')}
            <RequiredMark />
          </label>
          <input
            id="add-table-name"
            type="text"
            maxLength={120}
            autoComplete="off"
            placeholder={t('fieldNamePlaceholder')}
            value={name}
            disabled={createMutation.isPending}
            onChange={(e) => {
              setName(e.target.value)
              if (nameError) setNameError('')
            }}
            className={cn(fieldClass, nameError && fieldInvalidClass)}
            aria-invalid={nameError ? true : undefined}
          />
          {nameError ? (
            <p className="type-body-sm text-hisabi-error" role="alert">
              {nameError}
            </p>
          ) : (
            <p className="type-body-sm text-hisabi-on-surface-variant">
              {t('fieldNameHint')}
            </p>
          )}
        </div>
      </form>
    </HisabiSheet>
  )
}
