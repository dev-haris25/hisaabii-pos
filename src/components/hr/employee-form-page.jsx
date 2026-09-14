'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronDown,
  ChevronLeft,
  FileText,
  Landmark,
  Plane,
  Save,
  Shield,
  Upload,
  User,
  Users,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { AuthSubmitButton } from '@/components/auth/auth-submit-button'
import { FlagCountrySelect } from '@/components/clients/flag-country-select'
import { NoCompanyProfileBanner } from '@/components/clients/no-company-profile-banner'
import { LookupWithInlineCreate } from '@/components/hr/lookup-with-inline-create'
import { SearchableEntityPicker } from '@/components/invoices/searchable-entity-picker'
import { useRouter } from '@/i18n/navigation'
import { authGet, authPatch, authPost } from '@/lib/api/auth-client'
import { roleNameMessageKey } from '@/lib/hr/employees/role-name-message-key'
import { toastAuthApiError } from '@/lib/api/toast-auth-api-error'
import { scrollAfterFieldValidation } from '@/lib/ui/scroll-first-invalid-field'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'

function FormSection({ title, icon: Icon, children }) {
  return (
    <section className="overflow-hidden rounded-xl border border-hisabi-outline-variant/30 bg-hisabi-surface-container-lowest shadow-sm">
      <div className="flex items-center gap-hisabi-md border-b border-hisabi-outline-variant/20 px-hisabi-xl py-hisabi-lg sm:px-hisabi-xxl">
        <span
          className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-hisabi-secondary-fixed text-hisabi-primary shadow-hisabi-1"
          aria-hidden
        >
          <Icon className="size-5" aria-hidden />
        </span>
        <h3 className="type-headline-md font-bold text-hisabi-primary">{title}</h3>
      </div>
      <div className="space-y-hisabi-xl px-hisabi-xl pb-hisabi-xl pt-hisabi-md sm:px-hisabi-xxl sm:pb-hisabi-xxl sm:pt-hisabi-lg">
        {children}
      </div>
    </section>
  )
}

const fieldClass =
  'type-body-md text-hisabi-on-surface placeholder:text-hisabi-outline/70 w-full rounded-lg border border-hisabi-outline-variant bg-hisabi-surface-container-lowest px-hisabi-md py-3 outline-none transition-shadow focus:border-hisabi-primary focus:ring-1 focus:ring-hisabi-primary/15'

const selectClass =
  'type-body-md text-hisabi-on-surface w-full appearance-none rounded-lg border border-hisabi-outline-variant bg-hisabi-surface-container-lowest px-hisabi-md py-3 pe-10 outline-none transition-shadow focus:border-hisabi-primary focus:ring-1 focus:ring-hisabi-primary/15'

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

/** @param {string | null | undefined} iso */
function isoToDateInput(iso) {
  if (!iso) return ''
  return iso.slice(0, 10)
}

/** @param {File} file */
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '')
      const comma = dataUrl.indexOf(',')
      const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
      resolve({ base64, mime: file.type || 'application/octet-stream' })
    }
    reader.onerror = () => reject(new Error('read failed'))
    reader.readAsDataURL(file)
  })
}

/** @param {unknown} raw */
function normalizeNationalityIso2(raw) {
  const s = String(raw ?? '')
    .trim()
    .toUpperCase()
    .slice(0, 2)
  return /^[A-Z]{2}$/.test(s) ? s : ''
}

function emptyFormState() {
  return {
    name: '',
    mobileOfficial: '',
    emailOfficial: '',
    joiningDate: todayIso(),
    salary: '',
    higherEducation: '',
    experience: '',
    reportingToId: '',
    nationality: '',
    dateOfBirth: '',
    mobilePersonal: '',
    emailPersonal: '',
    emergencyContactName: '',
    emergencyContactNumber: '',
    address: '',
    shortAddress: '',
    bloodGroup: '',
    gender: 'unspecified',
    maritalStatus: 'unspecified',
    idTypeId: '',
    idNumber: '',
    idExpiry: '',
    bankAccountName: '',
    bankAccountNumber: '',
    bankName: '',
    bankIban: '',
    bankBranch: '',
    passportNumber: '',
    passportExpiry: '',
    visaNumber: '',
    visaIssueDate: '',
    visaEntryDate: '',
    visaExpiry: '',
    remark: '',
    status: 'active',
    roleIds: [],
    inviteEmail: '',
  }
}

/** @param {Record<string, unknown>} emp */
function employeeToForm(emp) {
  return {
    name: String(emp.name ?? ''),
    mobileOfficial: String(emp.mobileOfficial ?? ''),
    emailOfficial: String(emp.emailOfficial ?? ''),
    joiningDate: isoToDateInput(String(emp.joiningDate ?? '')) || todayIso(),
    salary: String(emp.salary ?? ''),
    higherEducation: String(emp.higherEducation ?? ''),
    experience: String(emp.experience ?? ''),
    reportingToId: String(emp.reportingToId ?? ''),
    nationality: normalizeNationalityIso2(emp.nationality),
    dateOfBirth: isoToDateInput(String(emp.dateOfBirth ?? '')),
    mobilePersonal: String(emp.mobilePersonal ?? ''),
    emailPersonal: String(emp.emailPersonal ?? ''),
    emergencyContactName: String(emp.emergencyContactName ?? ''),
    emergencyContactNumber: String(emp.emergencyContactNumber ?? ''),
    address: String(emp.address ?? ''),
    shortAddress: String(emp.shortAddress ?? ''),
    bloodGroup: String(emp.bloodGroup ?? ''),
    gender: String(emp.gender ?? 'unspecified'),
    maritalStatus: String(emp.maritalStatus ?? 'unspecified'),
    idTypeId: String(emp.idTypeId ?? ''),
    idNumber: String(emp.idNumber ?? ''),
    idExpiry: isoToDateInput(String(emp.idExpiry ?? '')),
    bankAccountName: String(emp.bankAccountName ?? ''),
    bankAccountNumber: String(emp.bankAccountNumber ?? ''),
    bankName: String(emp.bankName ?? ''),
    bankIban: String(emp.bankIban ?? ''),
    bankBranch: String(emp.bankBranch ?? ''),
    passportNumber: String(emp.passportNumber ?? ''),
    passportExpiry: isoToDateInput(String(emp.passportExpiry ?? '')),
    visaNumber: String(emp.visaNumber ?? ''),
    visaIssueDate: isoToDateInput(String(emp.visaIssueDate ?? '')),
    visaEntryDate: isoToDateInput(String(emp.visaEntryDate ?? '')),
    visaExpiry: isoToDateInput(String(emp.visaExpiry ?? '')),
    remark: String(emp.remark ?? ''),
    status: String(emp.status ?? 'active'),
    roleIds: Array.isArray(emp.roleIds) ? emp.roleIds.map(String) : [],
    inviteEmail: String(emp.emailOfficial ?? ''),
  }
}

const DOCUMENT_ACCEPT =
  'image/png,image/jpeg,image/gif,image/webp,application/pdf,.png,.jpg,.jpeg,.gif,.webp,.pdf'
const IMAGE_ACCEPT =
  'image/png,image/jpeg,image/gif,image/webp,.png,.jpg,.jpeg,.gif,.webp'

/**
 * @param {{
 *   label: string
 *   existingUrl?: string | null
 *   onFile: (payload: { base64: string, mime: string } | null) => void
 *   onClear?: () => void
 *   imageOnly?: boolean
 * }} props
 */
function FileUploadField({ label, existingUrl, onFile, onClear, imageOnly = false }) {
  const t = useTranslations('HR')
  const inputId = useId()
  const inputRef = useRef(/** @type {HTMLInputElement | null} */ (null))
  const [existingDismissed, setExistingDismissed] = useState(false)
  const [pending, setPending] = useState(
    /** @type {{ name: string, previewUrl: string | null, mime: string } | null} */ (null),
  )

  const accept = imageOnly ? IMAGE_ACCEPT : DOCUMENT_ACCEPT
  const formatsHint = imageOnly ? t('fileUploadImageFormats') : t('fileUploadFormats')

  useEffect(() => {
    return () => {
      if (pending?.previewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(pending.previewUrl)
      }
    }
  }, [pending?.previewUrl])

  const showExisting = Boolean(existingUrl) && !existingDismissed && !pending

  const handlePick = useCallback(async (file) => {
    if (!file) return
    try {
      const result = await readFileAsBase64(file)
      const previewUrl = file.type.startsWith('image/')
        ? URL.createObjectURL(file)
        : null
      setPending((prev) => {
        if (prev?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(prev.previewUrl)
        return { name: file.name, previewUrl, mime: result.mime }
      })
      setExistingDismissed(true)
      onFile(result)
    } catch {
      toast.error(t('fileReadError'))
    }
  }, [onFile, t])

  function handleInputChange(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) {
      onFile(null)
      return
    }
    void handlePick(file)
  }

  function handleRemovePending() {
    setPending((prev) => {
      if (prev?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(prev.previewUrl)
      return null
    })
    onFile(null)
    if (existingUrl && onClear) {
      setExistingDismissed(true)
      onClear()
    }
  }

  function handleRemoveExisting() {
    setExistingDismissed(true)
    onClear?.()
  }

  return (
    <div className="space-y-hisabi-xs">
      <label className="type-label-md text-hisabi-on-surface-variant block" htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={handleInputChange}
      />

      {pending ? (
        <div className="border-hisabi-outline-variant flex w-full flex-col items-center gap-hisabi-md rounded-xl border-2 border-dashed bg-hisabi-surface-container-lowest p-hisabi-lg">
          {pending.previewUrl ? (
            <div className="border-hisabi-outline-variant relative flex min-h-[120px] w-full items-center justify-center overflow-hidden rounded-xl border bg-hisabi-surface-container p-hisabi-sm shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={pending.previewUrl}
                alt=""
                className="max-h-40 w-auto max-w-full object-contain"
              />
            </div>
          ) : (
            <div className="border-hisabi-outline-variant flex min-h-[100px] w-full flex-col items-center justify-center gap-hisabi-sm rounded-xl border bg-hisabi-surface-container p-hisabi-md shadow-sm">
              <FileText className="size-10 text-hisabi-teal" aria-hidden />
              <p className="type-body-sm text-hisabi-on-surface max-w-full truncate px-hisabi-sm text-center">
                {pending.name}
              </p>
            </div>
          )}
          <p className="type-body-sm text-hisabi-teal max-w-full truncate text-center">
            {t('fileSelected', { name: pending.name })}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-hisabi-sm">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="type-label-md border-hisabi-teal-container text-hisabi-teal hover:bg-hisabi-teal-container/10 rounded-xl border-2 px-hisabi-lg py-2.5 font-semibold transition-colors"
            >
              {t('fileReplace')}
            </button>
            <button
              type="button"
              onClick={handleRemovePending}
              className="type-label-md text-hisabi-outline hover:text-hisabi-error rounded-xl border-2 border-transparent px-hisabi-lg py-2.5 font-semibold transition-colors"
            >
              {t('removeFile')}
            </button>
          </div>
        </div>
      ) : showExisting ? (
        <div className="border-hisabi-outline-variant flex w-full flex-col items-center gap-hisabi-md rounded-xl border-2 border-dashed bg-hisabi-surface-container-lowest p-hisabi-lg">
          {imageOnly && existingUrl ? (
            <div className="border-hisabi-outline-variant relative flex min-h-[120px] w-full items-center justify-center overflow-hidden rounded-xl border bg-hisabi-surface-container p-hisabi-sm shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={existingUrl}
                alt=""
                className="max-h-40 w-auto max-w-full object-contain"
              />
            </div>
          ) : (
            <div className="border-hisabi-outline-variant flex min-h-[100px] w-full flex-col items-center justify-center gap-hisabi-sm rounded-xl border bg-hisabi-surface-container p-hisabi-md shadow-sm">
              <FileText className="size-10 text-hisabi-teal" aria-hidden />
              <a
                href={existingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="type-body-sm text-hisabi-primary hover:underline"
              >
                {t('viewExistingFile')}
              </a>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-center gap-hisabi-sm">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="type-label-md border-hisabi-teal-container text-hisabi-teal hover:bg-hisabi-teal-container/10 rounded-xl border-2 px-hisabi-lg py-2.5 font-semibold transition-colors"
            >
              {t('fileReplace')}
            </button>
            {onClear ? (
              <button
                type="button"
                onClick={handleRemoveExisting}
                className="type-label-md text-hisabi-outline hover:text-hisabi-error rounded-xl border-2 border-transparent px-hisabi-lg py-2.5 font-semibold transition-colors"
              >
                {t('removeFile')}
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="border-hisabi-outline-variant hover:border-hisabi-teal-container group flex w-full min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed bg-hisabi-surface-container-lowest p-hisabi-lg transition-colors"
        >
          <div className="mb-hisabi-md flex size-14 items-center justify-center rounded-full bg-hisabi-surface-container transition-colors group-hover:bg-hisabi-primary-fixed/40">
            <Upload className="size-7 text-hisabi-teal" aria-hidden />
          </div>
          <p className="type-label-md text-hisabi-teal">{t('fileUploadHint')}</p>
          <p className="type-body-sm text-hisabi-outline mt-hisabi-xs text-center">{formatsHint}</p>
        </button>
      )}
    </div>
  )
}

/**
 * @param {{
 *   mode: 'add' | 'edit'
 *   employee?: Record<string, unknown> | null
 *   employeeId?: string | null
 *   hasBusinessProfile?: boolean
 * }} props
 */
export function EmployeeFormPage({ mode, employee, employeeId, hasBusinessProfile }) {
  const t = useTranslations('HR')
  const tClients = useTranslations('Clients')
  const router = useRouter()
  const queryClient = useQueryClient()
  const titleId = useId()
  const activeBusinessProfileId = useAuthStore(
    (s) => s.user?.activeBusinessProfileId ?? null,
  )

  const [form, setForm] = useState(() =>
    mode === 'edit' && employee ? employeeToForm(employee) : emptyFormState(),
  )
  const [fieldErrors, setFieldErrors] = useState(/** @type {Record<string, string>} */ ({}))
  const [submitting, setSubmitting] = useState(false)

  const [idTypeExtras, setIdTypeExtras] = useState(
    /** @type {{ id: string, label: string }[]} */ ([]),
  )

  const [filePayloads, setFilePayloads] = useState(
    /** @type {Record<string, { base64: string, mime: string } | null>} */ ({}),
  )
  const [clearFlags, setClearFlags] = useState(
    /** @type {Record<string, boolean>} */ ({}),
  )

  const lookupQueryEnabled =
    hasBusinessProfile === true && Boolean(activeBusinessProfileId)

  const { data: idTypesRes } = useQuery({
    queryKey: ['hr-id-types', activeBusinessProfileId],
    queryFn: async () => authGet('/hr/id-types'),
    enabled: lookupQueryEnabled,
  })

  const idTypeOptions = useMemo(() => {
    const fromApi = (idTypesRes?.items ?? []).map((d) => ({
      id: d.id,
      label: d.name,
    }))
    const ids = new Set(fromApi.map((o) => o.id))
    return [...fromApi, ...idTypeExtras.filter((o) => !ids.has(o.id))]
  }, [idTypesRes?.items, idTypeExtras])

  const { data: employeesRes, isLoading: employeesLoading } = useQuery({
    queryKey: ['hr-employees', activeBusinessProfileId],
    queryFn: async () => authGet('/hr/employees'),
    enabled: hasBusinessProfile === true && Boolean(activeBusinessProfileId),
  })

  const { data: countries = [], isLoading: countriesLoading } = useQuery({
    queryKey: ['countries', 'world-v1'],
    queryFn: async () => {
      const data = await authGet('/countries')
      return /** @type {Array<{ code: string, name: string }>} */ (data.countries ?? [])
    },
    enabled: hasBusinessProfile === true,
    staleTime: 86_400_000,
  })

  const { data: rolesRes } = useQuery({
    queryKey: ['hr-roles', activeBusinessProfileId],
    queryFn: async () => authGet('/hr/roles'),
    enabled: lookupQueryEnabled,
  })

  const roleOptions = useMemo(() => rolesRes?.items ?? [], [rolesRes?.items])

  const employeePickerItems = useMemo(() => {
    return (employeesRes?.items ?? [])
      .filter((e) => e.id !== employeeId)
      .map((e) => ({
        id: e.id,
        label: e.name,
        sublabel: e.emailOfficial ?? e.mobileOfficial ?? '',
      }))
  }, [employeesRes?.items, employeeId])

  const updateField = useCallback((key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setFieldErrors((prev) => ({ ...prev, [key]: '' }))
  }, [])

  function validate() {
    /** @type {Record<string, string>} */
    const next = {}
    if (!form.name.trim()) next.name = t('validationRequired')
    if (!form.joiningDate.trim()) next.joiningDate = t('validationRequired')
    if (!form.salary.trim()) next.salary = t('validationRequired')
    setFieldErrors(next)
    return Object.keys(next).length === 0
  }

  function buildPayload() {
    const nullableId = (v) => (v?.trim() ? v.trim() : null)
    const nullableDate = (v) => (v?.trim() ? v.trim() : null)

    /** @type {Record<string, unknown>} */
    const payload = {
      ...form,
      reportingToId: nullableId(form.reportingToId),
      idTypeId: nullableId(form.idTypeId),
      dateOfBirth: nullableDate(form.dateOfBirth),
      idExpiry: nullableDate(form.idExpiry),
      passportExpiry: nullableDate(form.passportExpiry),
      visaIssueDate: nullableDate(form.visaIssueDate),
      visaEntryDate: nullableDate(form.visaEntryDate),
      visaExpiry: nullableDate(form.visaExpiry),
      nationality: form.nationality?.trim()
        ? normalizeNationalityIso2(form.nationality) || form.nationality.trim()
        : null,
      clearResume: clearFlags.resume ?? false,
      clearAppointmentLetter: clearFlags.appointmentLetter ?? false,
      clearIdDocument: clearFlags.idDocument ?? false,
      clearPhoto: clearFlags.photo ?? false,
      clearPassport: clearFlags.passport ?? false,
      clearVisa: clearFlags.visa ?? false,
      roleIds: Array.isArray(form.roleIds) ? form.roleIds : [],
      inviteEmail: (form.inviteEmail || form.emailOfficial || '').trim(),
    }

    const fileMap = {
      resume: ['resumeBase64', 'resumeMimeType'],
      appointmentLetter: ['appointmentLetterBase64', 'appointmentLetterMimeType'],
      idDocument: ['idDocumentBase64', 'idDocumentMimeType'],
      photo: ['photoBase64', 'photoMimeType'],
      passport: ['passportBase64', 'passportMimeType'],
      visa: ['visaBase64', 'visaMimeType'],
    }

    for (const [key, [b64Key, mimeKey]] of Object.entries(fileMap)) {
      const file = filePayloads[key]
      if (file?.base64) {
        payload[b64Key] = file.base64
        payload[mimeKey] = file.mime
      }
    }

    return payload
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!validate()) {
      scrollAfterFieldValidation()
      return
    }
    setSubmitting(true)
    try {
      const payload = buildPayload()
      if (mode === 'add') {
        const res = await authPost('/hr/employees', payload)
        toast.success(res?.invitationSent ? t('invitationSentToast') : t('employeeAdded'))
      } else if (employeeId) {
        const res = await authPatch(`/hr/employees/${employeeId}`, payload)
        toast.success(res?.invitationSent ? t('invitationSentToast') : t('employeeUpdated'))
      }
      await queryClient.invalidateQueries({ queryKey: ['hr-employees'] })
      router.push('/hr/employees')
    } catch (err) {
      toastAuthApiError(t, err)
    } finally {
      setSubmitting(false)
    }
  }

  const shell = (
    <div className="min-h-screen bg-transparent pb-hisabi-xxl">
      <header className="border-b border-transparent bg-transparent">
        <div className="mx-auto flex min-h-20 max-w-hisabi-container flex-wrap items-center gap-hisabi-md px-hisabi-md py-hisabi-md sm:px-hisabi-xl">
          <button
            type="button"
            onClick={() => router.push('/hr/employees')}
            className="text-hisabi-primary hover:bg-hisabi-surface-container-low flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors"
            aria-label={t('backToEmployees')}
          >
            <ChevronLeft className="size-5 rtl:rotate-180" aria-hidden />
          </button>
          <div className="min-w-0 flex-1">
            <h1 id={titleId} className="type-headline-xl text-hisabi-on-surface tracking-tight">
              {mode === 'edit' ? t('editEmployeeTitle') : t('addEmployeeTitle')}
            </h1>
            <p className="type-body-md text-hisabi-on-surface-variant mt-0.5 max-w-2xl">
              {mode === 'edit' ? t('editEmployeeSubtitle') : t('addEmployeeSubtitle')}
            </p>
          </div>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="flex flex-col">
        <div className="relative mx-auto w-full max-w-hisabi-container space-y-hisabi-xl px-hisabi-md py-hisabi-xl sm:px-hisabi-lg lg:px-hisabi-xl">
          <FormSection title={t('sectionEmployeeDetails')} icon={Users}>
            <div className="grid grid-cols-1 gap-hisabi-md sm:grid-cols-2">
              <div className="space-y-hisabi-xs sm:col-span-2">
                <label className="type-label-md text-hisabi-on-surface-variant block">
                  {t('fieldName')}
                  <span className="ms-0.5 font-semibold text-hisabi-error" aria-hidden>*</span>
                </label>
                <input
                  value={form.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  className={cn(fieldClass, fieldErrors.name && 'border-hisabi-error')}
                  placeholder={t('placeholderName')}
                />
                {fieldErrors.name ? (
                  <p className="type-body-sm text-hisabi-error">{fieldErrors.name}</p>
                ) : null}
              </div>

              <div className="space-y-hisabi-xs">
                <label className="type-label-md text-hisabi-on-surface-variant block">
                  {t('fieldMobileOfficial')}
                </label>
                <input
                  value={form.mobileOfficial}
                  onChange={(e) => updateField('mobileOfficial', e.target.value)}
                  className={fieldClass}
                  dir="ltr"
                  placeholder={t('placeholderPhone')}
                />
              </div>

              <div className="space-y-hisabi-xs">
                <label className="type-label-md text-hisabi-on-surface-variant block">
                  {t('fieldEmailOfficial')}
                </label>
                <input
                  type="email"
                  value={form.emailOfficial}
                  onChange={(e) => updateField('emailOfficial', e.target.value)}
                  className={fieldClass}
                  dir="ltr"
                  placeholder={t('placeholderEmail')}
                />
              </div>

              <div className="space-y-hisabi-xs">
                <label className="type-label-md text-hisabi-on-surface-variant block">
                  {t('fieldJoiningDate')}
                  <span className="ms-0.5 font-semibold text-hisabi-error" aria-hidden>*</span>
                </label>
                <input
                  type="date"
                  value={form.joiningDate}
                  onChange={(e) => updateField('joiningDate', e.target.value)}
                  className={cn(fieldClass, fieldErrors.joiningDate && 'border-hisabi-error')}
                />
              </div>

              <div className="space-y-hisabi-xs">
                <label className="type-label-md text-hisabi-on-surface-variant block">
                  {t('fieldSalary')}
                  <span className="ms-0.5 font-semibold text-hisabi-error" aria-hidden>*</span>
                </label>
                <input
                  value={form.salary}
                  onChange={(e) => updateField('salary', e.target.value)}
                  className={cn(fieldClass, fieldErrors.salary && 'border-hisabi-error')}
                  dir="ltr"
                  placeholder={t('placeholderSalary')}
                />
              </div>

              <div className="space-y-hisabi-xs">
                <label className="type-label-md text-hisabi-on-surface-variant block">
                  {t('fieldHigherEducation')}
                </label>
                <input
                  value={form.higherEducation}
                  onChange={(e) => updateField('higherEducation', e.target.value)}
                  className={fieldClass}
                  placeholder={t('placeholderHigherEducation')}
                />
              </div>

              <div className="space-y-hisabi-xs">
                <label className="type-label-md text-hisabi-on-surface-variant block">
                  {t('fieldExperience')}
                </label>
                <input
                  value={form.experience}
                  onChange={(e) => updateField('experience', e.target.value)}
                  className={fieldClass}
                  placeholder={t('placeholderExperience')}
                />
              </div>

              <div className="space-y-hisabi-xs sm:col-span-2">
                <label className="type-label-md text-hisabi-on-surface-variant block">
                  {t('fieldReportingTo')}
                </label>
                <SearchableEntityPicker
                  items={employeePickerItems}
                  loading={employeesLoading}
                  value={form.reportingToId}
                  onChange={(id) => updateField('reportingToId', id)}
                  emptyLabel={t('selectEmployee')}
                  searchPlaceholder={t('searchEmployeesPlaceholder')}
                  triggerClassName={selectClass}
                />
              </div>

              <FileUploadField
                label={t('fieldResume')}
                existingUrl={employee?.resumeUrl}
                onFile={(f) => setFilePayloads((p) => ({ ...p, resume: f }))}
                onClear={() => setClearFlags((p) => ({ ...p, resume: true }))}
              />

              <FileUploadField
                label={t('fieldAppointmentLetter')}
                existingUrl={employee?.appointmentLetterUrl}
                onFile={(f) => setFilePayloads((p) => ({ ...p, appointmentLetter: f }))}
                onClear={() => setClearFlags((p) => ({ ...p, appointmentLetter: true }))}
              />

              <div className="space-y-hisabi-xs">
                <label className="type-label-md text-hisabi-on-surface-variant block">
                  {t('fieldStatus')}
                </label>
                <div className="relative">
                  <select
                    value={form.status}
                    onChange={(e) => updateField('status', e.target.value)}
                    className={selectClass}
                  >
                    <option value="active">{t('statusActive')}</option>
                    <option value="inactive">{t('statusInactive')}</option>
                  </select>
                  <ChevronDown
                    className="pointer-events-none absolute end-3 top-1/2 size-5 -translate-y-1/2 text-hisabi-on-surface-variant"
                    aria-hidden
                  />
                </div>
              </div>
            </div>
          </FormSection>

          <FormSection title={t('sectionPersonalDetails')} icon={User}>
            <div className="grid grid-cols-1 gap-hisabi-md sm:grid-cols-2">
              <div className="space-y-hisabi-xs">
                <label
                  htmlFor="employee-nationality"
                  className="type-label-md text-hisabi-on-surface-variant block"
                >
                  {t('fieldNationality')}
                </label>
                <FlagCountrySelect
                  id="employee-nationality"
                  value={form.nationality}
                  onChange={(code) => updateField('nationality', code)}
                  countries={countries}
                  loading={countriesLoading}
                  emptyLabel={tClients('countryPlaceholder')}
                  triggerClassName={fieldClass}
                />
              </div>

              {[
                ['mobilePersonal', 'fieldMobilePersonal', 'placeholderPhone'],
                ['emailPersonal', 'fieldEmailPersonal', 'placeholderEmail'],
                ['emergencyContactName', 'fieldEmergencyContactName', 'placeholderEmergencyContactName'],
                ['emergencyContactNumber', 'fieldEmergencyContactNumber', 'placeholderPhone'],
                ['bloodGroup', 'fieldBloodGroup', 'placeholderBloodGroup'],
                ['idNumber', 'fieldIdNumber', 'placeholderIdNumber'],
              ].map(([key, labelKey, placeholderKey]) => (
                <div key={key} className="space-y-hisabi-xs">
                  <label className="type-label-md text-hisabi-on-surface-variant block">
                    {t(labelKey)}
                  </label>
                  <input
                    value={form[key]}
                    onChange={(e) => updateField(key, e.target.value)}
                    className={fieldClass}
                    dir={key.includes('mobile') || key.includes('Number') ? 'ltr' : undefined}
                    placeholder={t(placeholderKey)}
                  />
                </div>
              ))}

              <div className="space-y-hisabi-xs">
                <label className="type-label-md text-hisabi-on-surface-variant block">
                  {t('fieldDateOfBirth')}
                </label>
                <input
                  type="date"
                  value={form.dateOfBirth}
                  onChange={(e) => updateField('dateOfBirth', e.target.value)}
                  className={fieldClass}
                />
              </div>

              <div className="space-y-hisabi-xs">
                <label className="type-label-md text-hisabi-on-surface-variant block">
                  {t('fieldIdExpiry')}
                </label>
                <input
                  type="date"
                  value={form.idExpiry}
                  onChange={(e) => updateField('idExpiry', e.target.value)}
                  className={fieldClass}
                />
              </div>

              <div className="space-y-hisabi-xs sm:col-span-2">
                <label className="type-label-md text-hisabi-on-surface-variant block">
                  {t('fieldAddress')}
                </label>
                <textarea
                  rows={3}
                  value={form.address}
                  onChange={(e) => updateField('address', e.target.value)}
                  className={cn(fieldClass, 'resize-none')}
                  placeholder={t('placeholderAddress')}
                />
              </div>

              <div className="space-y-hisabi-xs sm:col-span-2">
                <label className="type-label-md text-hisabi-on-surface-variant block">
                  {t('fieldShortAddress')}
                </label>
                <input
                  value={form.shortAddress}
                  onChange={(e) =>
                    updateField('shortAddress', e.target.value.slice(0, 300))
                  }
                  className={fieldClass}
                  placeholder={t('placeholderShortAddress')}
                  dir="ltr"
                  autoComplete="off"
                />
              </div>

              <div className="space-y-hisabi-xs">
                <label className="type-label-md text-hisabi-on-surface-variant block">
                  {t('fieldGender')}
                </label>
                <div className="relative">
                  <select
                    value={form.gender}
                    onChange={(e) => updateField('gender', e.target.value)}
                    className={selectClass}
                  >
                    <option value="unspecified">{t('genderUnspecified')}</option>
                    <option value="male">{t('genderMale')}</option>
                    <option value="female">{t('genderFemale')}</option>
                  </select>
                  <ChevronDown
                    className="pointer-events-none absolute end-3 top-1/2 size-5 -translate-y-1/2 text-hisabi-on-surface-variant"
                    aria-hidden
                  />
                </div>
              </div>

              <div className="space-y-hisabi-xs">
                <label className="type-label-md text-hisabi-on-surface-variant block">
                  {t('fieldMaritalStatus')}
                </label>
                <div className="relative">
                  <select
                    value={form.maritalStatus}
                    onChange={(e) => updateField('maritalStatus', e.target.value)}
                    className={selectClass}
                  >
                    <option value="unspecified">{t('maritalUnspecified')}</option>
                    <option value="single">{t('maritalSingle')}</option>
                    <option value="married">{t('maritalMarried')}</option>
                    <option value="other">{t('maritalOther')}</option>
                  </select>
                  <ChevronDown
                    className="pointer-events-none absolute end-3 top-1/2 size-5 -translate-y-1/2 text-hisabi-on-surface-variant"
                    aria-hidden
                  />
                </div>
              </div>

              <div className="space-y-hisabi-xs sm:col-span-2">
                <label className="type-label-md text-hisabi-on-surface-variant block">
                  {t('fieldIdType')}
                </label>
                <LookupWithInlineCreate
                  kind="idType"
                  value={form.idTypeId}
                  onChange={(id) => updateField('idTypeId', id)}
                  options={idTypeOptions}
                  onOptionCreated={(opt) => {
                    setIdTypeExtras((prev) => [...prev, opt])
                    void queryClient.invalidateQueries({ queryKey: ['hr-id-types'] })
                  }}
                  selectClass={selectClass}
                />
              </div>

              <FileUploadField
                label={t('fieldIdDocument')}
                existingUrl={employee?.idDocumentUrl}
                onFile={(f) => setFilePayloads((p) => ({ ...p, idDocument: f }))}
                onClear={() => setClearFlags((p) => ({ ...p, idDocument: true }))}
              />

              <FileUploadField
                label={t('fieldPhoto')}
                imageOnly
                existingUrl={employee?.photoUrl}
                onFile={(f) => setFilePayloads((p) => ({ ...p, photo: f }))}
                onClear={() => setClearFlags((p) => ({ ...p, photo: true }))}
              />
            </div>
          </FormSection>

          <FormSection title={t('sectionBankDetails')} icon={Landmark}>
            <div className="grid grid-cols-1 gap-hisabi-md sm:grid-cols-2">
              {[
                ['bankAccountName', 'fieldBankAccountName', 'placeholderBankAccountName'],
                ['bankAccountNumber', 'fieldBankAccountNumber', 'placeholderBankAccountNumber'],
                ['bankName', 'fieldBankName', 'placeholderBankName'],
                ['bankIban', 'fieldBankIban', 'placeholderBankIban'],
                ['bankBranch', 'fieldBankBranch', 'placeholderBankBranch'],
              ].map(([key, labelKey, placeholderKey]) => (
                <div key={key} className="space-y-hisabi-xs">
                  <label className="type-label-md text-hisabi-on-surface-variant block">
                    {t(labelKey)}
                  </label>
                  <input
                    value={form[key]}
                    onChange={(e) => updateField(key, e.target.value)}
                    className={fieldClass}
                    dir={key === 'bankIban' || key === 'bankAccountNumber' ? 'ltr' : undefined}
                    placeholder={t(placeholderKey)}
                  />
                </div>
              ))}
            </div>
          </FormSection>

          <FormSection title={t('sectionVisaPassport')} icon={Plane}>
            <div className="grid grid-cols-1 gap-hisabi-md sm:grid-cols-2">
              <div className="space-y-hisabi-xs">
                <label className="type-label-md text-hisabi-on-surface-variant block">
                  {t('fieldPassportNumber')}
                </label>
                <input
                  value={form.passportNumber}
                  onChange={(e) => updateField('passportNumber', e.target.value)}
                  className={fieldClass}
                  dir="ltr"
                  placeholder={t('placeholderPassportNumber')}
                />
              </div>

              <div className="space-y-hisabi-xs">
                <label className="type-label-md text-hisabi-on-surface-variant block">
                  {t('fieldPassportExpiry')}
                </label>
                <input
                  type="date"
                  value={form.passportExpiry}
                  onChange={(e) => updateField('passportExpiry', e.target.value)}
                  className={fieldClass}
                />
              </div>

              <div className="space-y-hisabi-xs">
                <label className="type-label-md text-hisabi-on-surface-variant block">
                  {t('fieldVisaNumber')}
                </label>
                <input
                  value={form.visaNumber}
                  onChange={(e) => updateField('visaNumber', e.target.value)}
                  className={fieldClass}
                  dir="ltr"
                  placeholder={t('placeholderVisaNumber')}
                />
              </div>

              <div className="space-y-hisabi-xs">
                <label className="type-label-md text-hisabi-on-surface-variant block">
                  {t('fieldVisaIssueDate')}
                </label>
                <input
                  type="date"
                  value={form.visaIssueDate}
                  onChange={(e) => updateField('visaIssueDate', e.target.value)}
                  className={fieldClass}
                />
              </div>

              <div className="space-y-hisabi-xs">
                <label className="type-label-md text-hisabi-on-surface-variant block">
                  {t('fieldVisaEntryDate')}
                </label>
                <input
                  type="date"
                  value={form.visaEntryDate}
                  onChange={(e) => updateField('visaEntryDate', e.target.value)}
                  className={fieldClass}
                />
              </div>

              <div className="space-y-hisabi-xs">
                <label className="type-label-md text-hisabi-on-surface-variant block">
                  {t('fieldVisaExpiry')}
                </label>
                <input
                  type="date"
                  value={form.visaExpiry}
                  onChange={(e) => updateField('visaExpiry', e.target.value)}
                  className={fieldClass}
                />
              </div>

              <FileUploadField
                label={t('fieldPassportDocument')}
                existingUrl={employee?.passportUrl}
                onFile={(f) => setFilePayloads((p) => ({ ...p, passport: f }))}
                onClear={() => setClearFlags((p) => ({ ...p, passport: true }))}
              />

              <FileUploadField
                label={t('fieldVisaDocument')}
                existingUrl={employee?.visaUrl}
                onFile={(f) => setFilePayloads((p) => ({ ...p, visa: f }))}
                onClear={() => setClearFlags((p) => ({ ...p, visa: true }))}
              />

              <div className="space-y-hisabi-xs sm:col-span-2">
                <label className="type-label-md text-hisabi-on-surface-variant block">
                  {t('fieldRemark')}
                </label>
                <textarea
                  rows={4}
                  value={form.remark}
                  onChange={(e) => updateField('remark', e.target.value)}
                  className={cn(fieldClass, 'resize-none')}
                  placeholder={t('placeholderRemark')}
                />
              </div>
            </div>
          </FormSection>

          <FormSection title={t('sectionAccessRoles')} icon={Shield}>
            <p className="type-body-sm text-hisabi-on-surface-variant">
              {t('sectionAccessRolesHint')}
            </p>
            <div className="grid grid-cols-1 gap-hisabi-sm sm:grid-cols-2">
              {roleOptions.map((role) => {
                const checked = (form.roleIds ?? []).includes(role.id)
                return (
                  <label
                    key={role.id}
                    className={cn(
                      'flex cursor-pointer items-start gap-hisabi-md rounded-lg border px-hisabi-md py-hisabi-md transition-colors',
                      checked
                        ? 'border-hisabi-primary bg-hisabi-primary-fixed/40'
                        : 'border-hisabi-outline-variant/50 bg-hisabi-surface-container-lowest',
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 size-4 accent-hisabi-primary"
                      checked={checked}
                      onChange={(e) => {
                        const next = new Set(form.roleIds ?? [])
                        if (e.target.checked) next.add(role.id)
                        else next.delete(role.id)
                        updateField('roleIds', [...next])
                      }}
                    />
                    <span className="min-w-0">
                      <span className="type-label-md text-hisabi-on-surface block font-semibold">
                        {(() => {
                          const key = roleNameMessageKey(role.name)
                          return key ? t(key) : role.name
                        })()}
                      </span>
                      {role.requiresNoLogin ? (
                        <span className="type-body-sm text-hisabi-on-surface-variant">
                          {t('roleRequiresNoLogin')}
                        </span>
                      ) : null}
                    </span>
                  </label>
                )
              })}
            </div>
            {mode === 'add' || !employee?.businessMembershipId ? (
              <div className="space-y-hisabi-xs">
                <label className="type-label-md text-hisabi-on-surface-variant block">
                  {t('fieldInviteEmail')}
                </label>
                <input
                  type="email"
                  value={form.inviteEmail}
                  onChange={(e) => updateField('inviteEmail', e.target.value)}
                  className={fieldClass}
                  dir="ltr"
                  placeholder={t('placeholderInviteEmail')}
                />
                <p className="type-body-sm text-hisabi-on-surface-variant">
                  {t('inviteEmailHint')}
                </p>
              </div>
            ) : null}
          </FormSection>
        </div>

        <div className="mx-auto mt-hisabi-xl flex w-full max-w-hisabi-container flex-col-reverse gap-hisabi-md border-t border-hisabi-outline-variant/20 px-hisabi-md pt-hisabi-xl pb-hisabi-lg sm:px-hisabi-xl min-[500px]:flex-row min-[500px]:justify-end min-[500px]:gap-hisabi-xl min-[500px]:border-t-0 min-[500px]:pb-hisabi-xxl min-[500px]:pt-0">
          <button
            type="button"
            onClick={() => router.push('/hr/employees')}
            className="type-label-md text-hisabi-primary hover:bg-hisabi-surface-container-low inline-flex min-h-[52px] w-full min-w-0 cursor-pointer items-center justify-center rounded-lg border border-hisabi-primary/20 px-hisabi-lg font-semibold transition-all active:scale-[0.98] min-[500px]:w-auto min-[500px]:min-w-[10rem]"
          >
            {t('cancel')}
          </button>
          <AuthSubmitButton
            type="submit"
            variant="gold"
            pending={submitting}
            className="min-h-0 w-full min-w-0 py-4 min-[500px]:w-auto min-[500px]:min-w-[12rem]"
          >
            <span className="flex items-center justify-center gap-hisabi-sm">
              <Save className="size-5 shrink-0" aria-hidden />
              {mode === 'edit' ? t('saveChanges') : t('saveEmployee')}
            </span>
          </AuthSubmitButton>
        </div>
      </form>
    </div>
  )

  if (hasBusinessProfile !== true) {
    return (
      <div className="mx-auto max-w-hisabi-container">
        <NoCompanyProfileBanner className="mb-hisabi-lg" />
        <div className="pointer-events-none select-none opacity-40">{shell}</div>
      </div>
    )
  }

  return shell
}
