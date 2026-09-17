'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, MonitorSmartphone, Plus, Trash2 } from 'lucide-react'
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
import {
  AuthApiError,
  authDelete,
  authGet,
  authPatch,
  authPost,
} from '@/lib/api/auth-client'
import { getHisabiDesktop, isHisabiDesktop } from '@/lib/desktop/hisabi-desktop'
import {
  openTillCashDrawer,
  writeTillCustomerDisplay,
} from '@/lib/desktop/till-hardware'
import { hasFullAccess } from '@/lib/rbac/ability-utils'
import {
  MAX_TILL_LAN_PRINTERS,
  normalizePrintVia,
  parseLanPrinters,
  parseUsbPrinters,
} from '@/lib/tills/till-printers'
import { cn } from '@/lib/utils'

const EMPTY_FORM = {
  name: '',
  displayEnabled: true,
  displayPort: '',
  displayBaud: 9600,
  drawerEnabled: true,
  drawerPort: '',
  printVia: /** @type {'lan' | 'usb'} */ ('lan'),
  lanPrinters: [{ ip: '', port: 9100 }],
  usbPrinters: /** @type {{ id: string, kind: 'serial' | 'winprinter', label: string }[]} */ ([]),
}

/**
 * @param {Record<string, unknown> | null} till
 */
function formFromTill(till) {
  if (!till) return { ...EMPTY_FORM, lanPrinters: [{ ip: '', port: 9100 }] }
  const lan = parseLanPrinters(till.lanPrinters)
  return {
    name: String(till.name ?? ''),
    displayEnabled: till.displayEnabled === true,
    displayPort: String(till.displayPort ?? ''),
    displayBaud: Number(till.displayBaud) || 9600,
    drawerEnabled: till.drawerEnabled === true,
    drawerPort: String(till.drawerPort ?? ''),
    printVia: normalizePrintVia(
      typeof till.printVia === 'string' ? till.printVia : 'lan',
    ),
    lanPrinters: lan.length > 0 ? lan : [{ ip: '', port: 9100 }],
    usbPrinters: parseUsbPrinters(till.usbPrinters),
  }
}

/**
 * @param {{
 *   className?: string
 *   disabled?: boolean
 *   value: string
 *   onChange: (value: string) => void
 *   children: import('react').ReactNode
 * }} props
 */
function TillSelect({ className, disabled, value, onChange, children }) {
  return (
    <div className="relative">
      <select
        className={cn(selectClass, className)}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute end-3 top-1/2 size-5 -translate-y-1/2 text-hisabi-on-surface-variant"
        aria-hidden
      />
    </div>
  )
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
    hasFullAccess(ability) || ability.can('update', 'BusinessSettings')
  const canUpdateHw = desktop && canUpdate

  const [localTillId, setLocalTillId] = useState(/** @type {string | null} */ (null))
  const [ports, setPorts] = useState(/** @type {string[]} */ ([]))
  const [printDevices, setPrintDevices] = useState(
    /** @type {{ id: string, kind: 'serial' | 'winprinter', label: string }[]} */ ([]),
  )
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
    api.listPrintDevices?.().then((list) => {
      if (Array.isArray(list)) {
        setPrintDevices(
          list
            .map((row) => ({
              id: String(row?.id ?? ''),
              kind: row?.kind === 'winprinter' ? 'winprinter' : 'serial',
              label: String(row?.label ?? row?.id ?? ''),
            }))
            .filter((row) => row.id),
        )
      }
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

  /** This PC’s till only (desktop binding). Browser falls back to first till for view/edit. */
  const boundTill = useMemo(() => {
    if (localTillId) {
      return tills.find((row) => row.id === localTillId) ?? null
    }
    return !desktop && tills[0] ? tills[0] : null
  }, [tills, localTillId, desktop])

  useEffect(() => {
    if (!localTillId && boundTill?.id) {
      setLocalTillId(String(boundTill.id))
    }
  }, [boundTill, localTillId])

  useEffect(() => {
    setForm(formFromTill(boundTill))
  }, [boundTill])

  const createMutation = useMutation({
    mutationFn: (name) => authPost('/tills', { name }),
    onSuccess: async (data) => {
      const till = data.till
      if (till?.id) {
        if (getHisabiDesktop()?.setTillId) {
          await getHisabiDesktop().setTillId(till.id)
        }
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
        printVia: form.printVia,
        lanPrinters: form.lanPrinters.map((p) => ({
          ip: String(p.ip).trim(),
          port: Number(p.port) || 9100,
        })),
        usbPrinters: form.usbPrinters,
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

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!boundTill?.id) throw new AuthApiError(400, 'VALIDATION_ERROR')
      return authDelete(`/tills/${boundTill.id}`)
    },
    onSuccess: async () => {
      if (getHisabiDesktop()?.setTillId) {
        await getHisabiDesktop().setTillId(null)
      }
      setLocalTillId(null)
      setForm(formFromTill(null))
      await queryClient.invalidateQueries({ queryKey: ['pos-tills'] })
      toast.success(t('tillDeleted'))
    },
    onError: (err) => {
      const code = err instanceof AuthApiError ? err.code : undefined
      toast.error(code ? tErr(code) : tErr('generic'))
    },
  })

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

  function handleDelete() {
    if (!boundTill?.id || !canUpdate) return
    const name = String(boundTill.name ?? form.name ?? '')
    if (!window.confirm(t('tillDeleteConfirm', { name }))) return
    deleteMutation.mutate()
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
  const hwDisabled = !canUpdateHw
  const usbDeviceOptions = Array.from(
    new Map(
      [...printDevices, ...form.usbPrinters]
        .filter((d) => d.id)
        .map((d) => [`${d.kind}:${d.id}`, d]),
    ).values(),
  )
  const portOptions = Array.from(
    new Set(
      [...ports, form.displayPort, form.drawerPort].filter((p) => String(p).trim()),
    ),
  )

  return (
    <SettingsPageShell title={t('tillTitle')} subtitle={t('tillSubtitle')}>
      {!desktop ? (
        <p className="type-body-md text-hisabi-on-surface-variant rounded-lg border border-hisabi-outline-variant/30 bg-hisabi-surface-container-low/50 px-hisabi-md py-hisabi-sm">
          {t('tillChromePrinterHint')}
        </p>
      ) : null}

      <SettingsSection title={t('tillListTitle')} icon={MonitorSmartphone}>
        {boundTill ? (
          <div className="flex flex-wrap items-center justify-between gap-hisabi-sm rounded-lg border border-hisabi-outline-variant/30 px-hisabi-md py-hisabi-sm">
            <div>
              <p className="type-label-md font-bold text-hisabi-on-surface">
                {String(boundTill.name)}
                <span className="text-hisabi-primary ms-2 font-semibold">
                  {t('tillThisPc')}
                </span>
              </p>
              <p className="type-body-sm text-hisabi-on-surface-variant">
                {t('tillListMeta', {
                  display: String(boundTill.displayPort || '—'),
                  drawer: String(boundTill.drawerPort || '—'),
                })}
              </p>
            </div>
            {canUpdate ? (
              <button
                type="button"
                className="inline-flex size-11 items-center justify-center rounded-hisabi-md text-hisabi-error hover:bg-hisabi-error/10 disabled:opacity-50"
                disabled={deleteMutation.isPending}
                onClick={handleDelete}
                aria-label={t('tillDelete')}
              >
                <Trash2 className="size-5" aria-hidden />
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <p className="type-body-md text-hisabi-on-surface-variant">
              {desktop ? t('tillBindHint') : t('tillEmpty')}
            </p>
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
          </>
        )}
      </SettingsSection>

      {boundTill ? (
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

          <div className="space-y-hisabi-lg rounded-xl border border-hisabi-outline-variant/20 px-hisabi-md py-hisabi-md">
            <h3 className="type-label-md font-bold text-hisabi-on-surface">
              {t('tillPrintTitle')}
            </h3>
            <p className="type-body-sm text-hisabi-on-surface-variant">
              {t('tillPrintHint')}
            </p>
            <div className="flex flex-wrap gap-hisabi-lg">
              <label className="flex items-center gap-hisabi-sm">
                <input
                  type="radio"
                  name="till-print-via"
                  className="size-4 accent-hisabi-primary"
                  checked={form.printVia === 'lan'}
                  disabled={disabled}
                  onChange={() => setForm((f) => ({ ...f, printVia: 'lan' }))}
                />
                <span className="type-body-md">{t('tillPrintViaLan')}</span>
              </label>
              <label className="flex items-center gap-hisabi-sm">
                <input
                  type="radio"
                  name="till-print-via"
                  className="size-4 accent-hisabi-primary"
                  checked={form.printVia === 'usb'}
                  disabled={disabled}
                  onChange={() => setForm((f) => ({ ...f, printVia: 'usb' }))}
                />
                <span className="type-body-md">{t('tillPrintViaUsb')}</span>
              </label>
            </div>

            {form.printVia === 'lan' ? (
              <div className="space-y-hisabi-lg">
                {form.lanPrinters.map((printer, index) => (
                  <div
                    key={`lan-${index}`}
                    className="grid gap-hisabi-lg sm:grid-cols-[1fr_8rem_auto] sm:items-end"
                  >
                    <SettingsField
                      label={t('printerIpLabelIndexed', { n: index + 1 })}
                    >
                      <input
                        className={fieldClass}
                        dir="ltr"
                        value={printer.ip}
                        disabled={disabled}
                        onChange={(e) => {
                          const ip = e.target.value
                          setForm((f) => ({
                            ...f,
                            lanPrinters: f.lanPrinters.map((row, i) =>
                              i === index ? { ...row, ip } : row,
                            ),
                          }))
                        }}
                        placeholder={t('printerIpPlaceholder')}
                      />
                    </SettingsField>
                    <SettingsField label={t('printerPortLabel')}>
                      <input
                        className={fieldClass}
                        dir="ltr"
                        value={String(printer.port)}
                        disabled={disabled}
                        onChange={(e) => {
                          const port = Number.parseInt(e.target.value, 10) || 9100
                          setForm((f) => ({
                            ...f,
                            lanPrinters: f.lanPrinters.map((row, i) =>
                              i === index ? { ...row, port } : row,
                            ),
                          }))
                        }}
                      />
                    </SettingsField>
                    {form.lanPrinters.length > 1 ? (
                      <button
                        type="button"
                        disabled={disabled}
                        className="mb-0.5 inline-flex h-11 items-center justify-center rounded-hisabi-md px-3 text-hisabi-error hover:bg-hisabi-error/10 disabled:opacity-50"
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            lanPrinters: f.lanPrinters.filter((_, i) => i !== index),
                          }))
                        }
                        aria-label={t('printerRemove')}
                      >
                        <Trash2 className="size-5" aria-hidden />
                      </button>
                    ) : (
                      <span className="hidden sm:block" />
                    )}
                  </div>
                ))}
                {form.lanPrinters.length < MAX_TILL_LAN_PRINTERS ? (
                  <button
                    type="button"
                    disabled={disabled}
                    className="type-label-sm inline-flex cursor-pointer items-center gap-2 font-semibold text-hisabi-secondary hover:underline disabled:opacity-50"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        lanPrinters: [...f.lanPrinters, { ip: '', port: 9100 }],
                      }))
                    }
                  >
                    <Plus className="size-4" aria-hidden />
                    {t('printerAddMore')}
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="space-y-hisabi-sm">
                {!desktop ? (
                  <p className="type-body-sm text-hisabi-on-surface-variant">
                    {t('tillUsbChromeHint')}
                  </p>
                ) : null}
                {usbDeviceOptions.length === 0 ? (
                  <p className="type-body-sm text-hisabi-on-surface-variant">
                    {t('tillUsbEmpty')}
                  </p>
                ) : (
                  usbDeviceOptions.map((device) => {
                    const checked = form.usbPrinters.some(
                      (row) => row.id === device.id && row.kind === device.kind,
                    )
                    return (
                      <label
                        key={`${device.kind}-${device.id}`}
                        className="flex items-center gap-hisabi-sm"
                      >
                        <input
                          type="checkbox"
                          className="size-4 accent-hisabi-primary"
                          checked={checked}
                          disabled={!canUpdateHw}
                          onChange={() => {
                            setForm((f) => {
                              if (checked) {
                                return {
                                  ...f,
                                  usbPrinters: f.usbPrinters.filter(
                                    (row) =>
                                      !(
                                        row.id === device.id &&
                                        row.kind === device.kind
                                      ),
                                  ),
                                }
                              }
                              return {
                                ...f,
                                usbPrinters: [...f.usbPrinters, device],
                              }
                            })
                          }}
                        />
                        <span className="type-body-md">{device.label}</span>
                      </label>
                    )
                  })
                )}
              </div>
            )}
          </div>

          <div className="grid gap-hisabi-lg sm:grid-cols-2">
            <SettingsField label={t('tillDisplayEnabled')}>
              <label className="flex items-center gap-hisabi-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-hisabi-primary"
                  checked={form.displayEnabled}
                  disabled={hwDisabled}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, displayEnabled: e.target.checked }))
                  }
                />
                <span className="type-body-md">{t('tillEnabled')}</span>
              </label>
            </SettingsField>
            <SettingsField label={t('tillDrawerEnabled')}>
              <label className="flex items-center gap-hisabi-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-hisabi-primary"
                  checked={form.drawerEnabled}
                  disabled={hwDisabled}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, drawerEnabled: e.target.checked }))
                  }
                />
                <span className="type-body-md">{t('tillEnabled')}</span>
              </label>
            </SettingsField>
            <SettingsField label={t('tillDisplayPort')}>
              <TillSelect
                value={form.displayPort}
                disabled={hwDisabled}
                onChange={(displayPort) =>
                  setForm((f) => ({ ...f, displayPort }))
                }
              >
                <option value="">{t('tillPortNone')}</option>
                {portOptions.map((port) => (
                  <option key={`d-${port}`} value={port}>
                    {port}
                  </option>
                ))}
              </TillSelect>
            </SettingsField>
            <SettingsField label={t('tillDrawerPort')}>
              <TillSelect
                value={form.drawerPort}
                disabled={hwDisabled}
                onChange={(drawerPort) =>
                  setForm((f) => ({ ...f, drawerPort }))
                }
              >
                <option value="">{t('tillPortNone')}</option>
                {portOptions.map((port) => (
                  <option key={`k-${port}`} value={port}>
                    {port}
                  </option>
                ))}
              </TillSelect>
            </SettingsField>
            <SettingsField label={t('tillDisplayBaud')}>
              <input
                className={fieldClass}
                dir="ltr"
                inputMode="numeric"
                value={String(form.displayBaud)}
                disabled={hwDisabled}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    displayBaud: Number.parseInt(e.target.value, 10) || 9600,
                  }))
                }
              />
            </SettingsField>
          </div>

          {canUpdate ? (
            <SettingsFormFooter>
              {canUpdateHw ? (
                <>
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
                </>
              ) : null}
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
      ) : null}
    </SettingsPageShell>
  )
}
