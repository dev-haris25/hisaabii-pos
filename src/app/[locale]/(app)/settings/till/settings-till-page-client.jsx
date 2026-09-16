'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MonitorSmartphone } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { AppLoader } from '@/components/app-loader'
import { AuthSubmitButton } from '@/components/auth/auth-submit-button'
import { useAppAbility } from '@/components/rbac/ability-provider'
import {
  SettingsField,
  SettingsFormFooter,
  SettingsPageShell,
  SettingsSection,
  fieldClass,
  fieldInvalidClass,
  selectClass,
} from '@/components/settings/settings-page-shell'
import { AuthApiError, authGet, authPatch, authPost } from '@/lib/api/auth-client'
import { getHisabiDesktop, isHisabiDesktop } from '@/lib/desktop/hisabi-desktop'
import {
  openTillCashDrawer,
  writeTillCustomerDisplay,
} from '@/lib/desktop/till-hardware'
import { hasFullAccess } from '@/lib/rbac/ability-utils'
import { cn } from '@/lib/utils'

const EMPTY_FORM = {
  name: '',
  displayEnabled: true,
  displayPort: '',
  displayBaud: 9600,
  drawerEnabled: true,
  drawerPort: '',
}

/**
 * @param {Record<string, unknown> | null} till
 */
function formFromTill(till) {
  if (!till) return { ...EMPTY_FORM }
  return {
    name: String(till.name ?? ''),
    displayEnabled: till.displayEnabled === true,
    displayPort: String(till.displayPort ?? ''),
    displayBaud: Number(till.displayBaud) || 9600,
    drawerEnabled: till.drawerEnabled === true,
    drawerPort: String(till.drawerPort ?? ''),
  }
}

export function SettingsTillPageClient() {
  const t = useTranslations('Settings')
  const tErr = useTranslations('AuthErrors')
  const ability = useAppAbility()
  const queryClient = useQueryClient()
  const desktop = isHisabiDesktop()
  const canRead =
    hasFullAccess(ability) || ability.can('read', 'BusinessSettings')
  const canUpdate =
    desktop &&
    (hasFullAccess(ability) || ability.can('update', 'BusinessSettings'))

  const [localTillId, setLocalTillId] = useState(/** @type {string | null} */ (null))
  const [ports, setPorts] = useState(/** @type {string[]} */ ([]))
  const [form, setForm] = useState(EMPTY_FORM)
  const [nameError, setNameError] = useState('')
  const [newTillName, setNewTillName] = useState('')

  useEffect(() => {
    const api = getHisabiDesktop()
    if (!api) return
    api.getTillId?.().then((id) => {
      setLocalTillId(typeof id === 'string' && id ? id : null)
    })
    api.listSerialPorts?.().then((list) => {
      if (Array.isArray(list)) setPorts(list.map(String))
    })
  }, [])

  const tillsQuery = useQuery({
    queryKey: ['pos-tills'],
    queryFn: () => authGet('/tills'),
    enabled: canRead,
  })

  /** @type {Array<Record<string, unknown>>} */
  const tills = useMemo(
    () => (Array.isArray(tillsQuery.data?.tills) ? tillsQuery.data.tills : []),
    [tillsQuery.data],
  )
  const boundTill = useMemo(
    () => tills.find((row) => row.id === localTillId) ?? null,
    [tills, localTillId],
  )

  useEffect(() => {
    setForm(formFromTill(boundTill))
  }, [boundTill])

  const createMutation = useMutation({
    mutationFn: (name) => authPost('/tills', { name }),
    onSuccess: async (data) => {
      const till = data.till
      if (till?.id && getHisabiDesktop()?.setTillId) {
        await getHisabiDesktop().setTillId(till.id)
        setLocalTillId(till.id)
      }
      setNewTillName('')
      await queryClient.invalidateQueries({ queryKey: ['pos-tills'] })
      toast.success(t('tillCreated'))
    },
    onError: (err) => {
      const code = err instanceof AuthApiError ? err.code : undefined
      toast.error(code ? tErr(code) : tErr('generic'))
    },
  })

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!boundTill?.id) throw new AuthApiError(400, 'VALIDATION_ERROR')
      return authPatch(`/tills/${boundTill.id}`, {
        name: form.name.trim(),
        displayEnabled: form.displayEnabled,
        displayPort: form.displayPort.trim() || null,
        displayBaud: Number(form.displayBaud) || 9600,
        drawerEnabled: form.drawerEnabled,
        drawerPort: form.drawerPort.trim() || null,
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['pos-tills'] })
      toast.success(t('tillSaved'))
    },
    onError: (err) => {
      const code = err instanceof AuthApiError ? err.code : undefined
      toast.error(code ? tErr(code) : tErr('generic'))
    },
  })

  function bindTill(id) {
    const api = getHisabiDesktop()
    if (!api?.setTillId) return
    api.setTillId(id).then(() => setLocalTillId(id))
  }

  async function testDisplay() {
    try {
      await writeTillCustomerDisplay(
        {
          displayEnabled: form.displayEnabled,
          displayPort: form.displayPort,
          displayBaud: form.displayBaud,
        },
        '1234.50',
      )
      toast.success(t('tillTestDisplayOk'))
    } catch {
      toast.error(t('tillHardwareFailed'))
    }
  }

  async function testDrawer() {
    try {
      await openTillCashDrawer({
        drawerEnabled: form.drawerEnabled,
        drawerPort: form.drawerPort,
      })
      toast.success(t('tillTestDrawerOk'))
    } catch {
      toast.error(t('tillHardwareFailed'))
    }
  }

  function handleSave() {
    if (!form.name.trim()) {
      setNameError(t('tillNameRequired'))
      return
    }
    setNameError('')
    saveMutation.mutate()
  }

  if (!canRead) {
    return (
      <SettingsPageShell title={t('tillTitle')} subtitle={t('tillSubtitle')}>
        <p className="type-body-md text-hisabi-on-surface-variant">{t('noPermission')}</p>
      </SettingsPageShell>
    )
  }

  if (tillsQuery.isPending) {
    return (
      <SettingsPageShell title={t('tillTitle')} subtitle={t('tillSubtitle')}>
        <div className="flex justify-center py-hisabi-xxl">
          <AppLoader />
        </div>
      </SettingsPageShell>
    )
  }

  if (
    tillsQuery.isError &&
    tillsQuery.error instanceof AuthApiError &&
    tillsQuery.error.code === 'NO_COMPANY'
  ) {
    return (
      <SettingsPageShell title={t('tillTitle')} subtitle={t('tillSubtitle')}>
        <p className="type-body-md text-hisabi-on-surface-variant">{t('noCompany')}</p>
      </SettingsPageShell>
    )
  }

  const disabled = !canUpdate
  const portOptions = Array.from(
    new Set(
      [...ports, form.displayPort, form.drawerPort].filter((p) => String(p).trim()),
    ),
  )

  return (
    <SettingsPageShell title={t('tillTitle')} subtitle={t('tillSubtitle')}>
      {!desktop ? (
        <p className="type-body-md text-hisabi-on-surface-variant rounded-lg border border-hisabi-outline-variant/30 bg-hisabi-surface-container-low/50 px-hisabi-md py-hisabi-sm">
          {t('tillChromeViewOnly')}
        </p>
      ) : null}

      <SettingsSection title={t('tillListTitle')} icon={MonitorSmartphone}>
        {tills.length === 0 ? (
          <p className="type-body-md text-hisabi-on-surface-variant">{t('tillEmpty')}</p>
        ) : (
          <ul className="space-y-hisabi-sm">
            {tills.map((row) => (
              <li
                key={String(row.id)}
                className="flex flex-wrap items-center justify-between gap-hisabi-sm rounded-lg border border-hisabi-outline-variant/30 px-hisabi-md py-hisabi-sm"
              >
                <div>
                  <p className="type-label-md font-bold text-hisabi-on-surface">
                    {String(row.name)}
                    {row.id === localTillId ? (
                      <span className="text-hisabi-primary ms-2 font-semibold">
                        {t('tillThisPc')}
                      </span>
                    ) : null}
                  </p>
                  <p className="type-body-sm text-hisabi-on-surface-variant">
                    {t('tillListMeta', {
                      display: String(row.displayPort || '—'),
                      drawer: String(row.drawerPort || '—'),
                    })}
                  </p>
                </div>
                {canUpdate ? (
                  <AuthSubmitButton
                    type="button"
                    variant="secondary"
                    onClick={() => bindTill(String(row.id))}
                  >
                    {t('tillUseThis')}
                  </AuthSubmitButton>
                ) : (
                  <AuthSubmitButton
                    type="button"
                    variant="secondary"
                    onClick={() => setLocalTillId(String(row.id))}
                  >
                    {t('tillView')}
                  </AuthSubmitButton>
                )}
              </li>
            ))}
          </ul>
        )}

        {canUpdate ? (
          <div className="mt-hisabi-lg flex w-full flex-col gap-hisabi-md">
            <SettingsField label={t('tillNewName')} className="w-full">
              <input
                className={fieldClass}
                value={newTillName}
                onChange={(e) => setNewTillName(e.target.value)}
                placeholder={t('tillNewNamePlaceholder')}
              />
            </SettingsField>
            <AuthSubmitButton
              type="button"
              className="w-full sm:w-auto sm:min-w-[11rem] sm:self-start"
              pending={createMutation.isPending}
              onClick={() => {
                const name = newTillName.trim()
                if (!name) return
                createMutation.mutate(name)
              }}
            >
              {t('tillCreate')}
            </AuthSubmitButton>
          </div>
        ) : null}
      </SettingsSection>

      {boundTill || !desktop ? (
        <SettingsSection title={t('tillHardwareTitle')} icon={MonitorSmartphone}>
          <div className="grid gap-hisabi-lg sm:grid-cols-2">
            <SettingsField
              label={t('tillFieldName')}
              error={nameError}
              errorId="till-name-error"
            >
              <input
                className={cn(fieldClass, nameError && fieldInvalidClass)}
                value={form.name}
                disabled={disabled}
                onChange={(e) => {
                  setForm((f) => ({ ...f, name: e.target.value }))
                  if (nameError) setNameError('')
                }}
              />
            </SettingsField>
          </div>

          <div className="grid gap-hisabi-lg sm:grid-cols-2">
            <SettingsField label={t('tillDisplayEnabled')}>
              <label className="flex items-center gap-hisabi-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-hisabi-primary"
                  checked={form.displayEnabled}
                  disabled={disabled}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, displayEnabled: e.target.checked }))
                  }
                />
                <span className="type-body-md">{t('tillEnabled')}</span>
              </label>
            </SettingsField>
            <SettingsField label={t('tillDisplayPort')}>
              <select
                className={selectClass}
                value={form.displayPort}
                disabled={disabled}
                onChange={(e) =>
                  setForm((f) => ({ ...f, displayPort: e.target.value }))
                }
              >
                <option value="">{t('tillPortNone')}</option>
                {portOptions.map((port) => (
                  <option key={`d-${port}`} value={port}>
                    {port}
                  </option>
                ))}
              </select>
            </SettingsField>
            <SettingsField label={t('tillDisplayBaud')}>
              <input
                className={fieldClass}
                dir="ltr"
                inputMode="numeric"
                value={String(form.displayBaud)}
                disabled={disabled}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    displayBaud: Number.parseInt(e.target.value, 10) || 9600,
                  }))
                }
              />
            </SettingsField>
            <SettingsField label={t('tillDrawerEnabled')}>
              <label className="flex items-center gap-hisabi-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-hisabi-primary"
                  checked={form.drawerEnabled}
                  disabled={disabled}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, drawerEnabled: e.target.checked }))
                  }
                />
                <span className="type-body-md">{t('tillEnabled')}</span>
              </label>
            </SettingsField>
            <SettingsField label={t('tillDrawerPort')}>
              <select
                className={selectClass}
                value={form.drawerPort}
                disabled={disabled}
                onChange={(e) =>
                  setForm((f) => ({ ...f, drawerPort: e.target.value }))
                }
              >
                <option value="">{t('tillPortNone')}</option>
                {portOptions.map((port) => (
                  <option key={`k-${port}`} value={port}>
                    {port}
                  </option>
                ))}
              </select>
            </SettingsField>
          </div>

          {canUpdate ? (
            <SettingsFormFooter>
              <AuthSubmitButton
                type="button"
                variant="secondary"
                className="w-full min-[500px]:w-auto"
                onClick={() => testDisplay()}
              >
                {t('tillTestDisplay')}
              </AuthSubmitButton>
              <AuthSubmitButton
                type="button"
                variant="secondary"
                className="w-full min-[500px]:w-auto"
                onClick={() => testDrawer()}
              >
                {t('tillTestDrawer')}
              </AuthSubmitButton>
              <AuthSubmitButton
                type="button"
                className="w-full min-[500px]:w-auto min-[500px]:min-w-[10rem]"
                pending={saveMutation.isPending}
                onClick={handleSave}
              >
                {t('tillSave')}
              </AuthSubmitButton>
            </SettingsFormFooter>
          ) : null}
        </SettingsSection>
      ) : desktop ? (
        <p className="type-body-md text-hisabi-on-surface-variant">
          {t('tillBindHint')}
        </p>
      ) : null}
    </SettingsPageShell>
  )
}
