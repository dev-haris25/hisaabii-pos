'use client'

import { useMutation } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useId, useState } from 'react'
import { toast } from 'sonner'

import { AuthSubmitButton } from '@/components/auth/auth-submit-button'
import { useAppAbility } from '@/components/rbac/ability-provider'
import {
  SettingsSection,
  fieldClass,
  fieldInvalidClass,
} from '@/components/settings/settings-page-shell'
import { PageBackButton } from '@/components/shared/page-back-button'
import { RequiredMark } from '@/components/ui/required-mark'
import { useRouter } from '@/i18n/navigation'
import { AuthApiError, authPatch, authPost } from '@/lib/api/auth-client'
import { scrollAfterFieldValidation } from '@/lib/ui/scroll-first-invalid-field'
import { cn } from '@/lib/utils'

const FORM_FOOTER_CLASS =
  'flex w-full flex-col-reverse gap-hisabi-md border-t border-hisabi-outline-variant/20 pt-hisabi-xl min-[500px]:flex-row min-[500px]:justify-end min-[500px]:gap-hisabi-xl'

const SECONDARY_BTN_CLASS =
  'type-label-md text-hisabi-primary hover:bg-hisabi-surface-container-low inline-flex min-h-[52px] w-full min-w-0 cursor-pointer items-center justify-center rounded-lg border border-hisabi-primary/20 px-hisabi-lg font-semibold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 min-[500px]:w-auto min-[500px]:min-w-[10rem]'

/**
 * @param {{
 *   mode: 'create' | 'edit'
 *   table?: Record<string, unknown>
 * }} props
 */
export function TableFormView({ mode, table }) {
  const t = useTranslations('Tables')
  const tErr = useTranslations('AuthErrors')
  const router = useRouter()
  const titleId = useId()
  const ability = useAppAbility()
  const canSave =
    mode === 'create'
      ? ability.can('create', 'ETable')
      : ability.can('update', 'ETable')

  const [name, setName] = useState(
    mode === 'edit' ? String(table?.name ?? '') : '',
  )
  const [formError, setFormError] = useState('')
  const [nameError, setNameError] = useState('')

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { name: name.trim() }
      if (mode === 'create') {
        return authPost('/tables', payload)
      }
      return authPatch(`/tables/${table?.id}`, payload)
    },
    onSuccess: () => {
      toast.success(mode === 'create' ? t('created') : t('updated'))
      router.push('/tables')
      router.refresh()
    },
    onError: (err) => {
      const code = err instanceof AuthApiError ? err.code : undefined
      setFormError(code ? tErr(code) : tErr('generic'))
      toast.error(code ? tErr(code) : tErr('generic'))
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
    if (!canSave || saveMutation.isPending) return
    setNameError('')
    saveMutation.mutate()
  }

  return (
    <div className="mx-auto w-full max-w-hisabi-container space-y-hisabi-xl pb-hisabi-xxl">
      <PageBackButton href="/tables" label={t('formBackToList')} />
      <header className="space-y-1">
        <h1
          id={titleId}
          className="type-headline-xl text-hisabi-on-surface tracking-tight"
        >
          {mode === 'create' ? t('formNewTitle') : t('formEditTitle')}
        </h1>
        <p className="type-body-md text-hisabi-on-surface-variant max-w-2xl">
          {mode === 'create' ? t('formNewSubtitle') : t('formEditSubtitle')}
        </p>
      </header>

      <form onSubmit={handleSubmit} noValidate aria-labelledby={titleId}>
        <fieldset
          disabled={!canSave || saveMutation.isPending}
          className="min-w-0 space-y-hisabi-xl border-0 p-0"
        >
          {formError ? (
            <p className="type-body-md text-hisabi-error" role="alert">
              {formError}
            </p>
          ) : null}

          <SettingsSection title={t('formSectionDetails')}>
            <div className="space-y-hisabi-xs">
              <label
                className="type-label-md text-hisabi-on-surface-variant mb-hisabi-xs block"
                htmlFor="table-name"
              >
                {t('fieldName')}
                <RequiredMark />
              </label>
              <input
                id="table-name"
                type="text"
                maxLength={120}
                placeholder={t('fieldNamePlaceholder')}
                value={name}
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
          </SettingsSection>

          <div className={FORM_FOOTER_CLASS}>
            <button
              type="button"
              className={SECONDARY_BTN_CLASS}
              onClick={() => router.push('/tables')}
            >
              {t('cancel')}
            </button>
            <AuthSubmitButton
              type="submit"
              pending={saveMutation.isPending}
              disabled={!canSave}
              className="min-[500px]:min-w-[10rem]"
            >
              <Save className="size-4 shrink-0" aria-hidden />
              {mode === 'create' ? t('createSubmit') : t('saveSubmit')}
            </AuthSubmitButton>
          </div>
        </fieldset>
      </form>
    </div>
  )
}
