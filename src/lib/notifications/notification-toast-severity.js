import { toast } from 'sonner'

const ERROR_TYPES = new Set([
  'zatca_report_failed',
  'salary_cap_exceeded',
  'visa_expired',
])

const WARNING_TYPES = new Set([
  'zatca_report_pending',
  'visa_expiring',
  'salary_cap_reached',
  'advance_outstanding',
  'invoice_voided',
])

const INFO_TYPES = new Set(['role_changed', 'member_joined'])

/**
 * @param {string} type
 */
export function notificationToastFn(type) {
  if (ERROR_TYPES.has(type)) return toast.error
  if (WARNING_TYPES.has(type)) return toast.warning
  if (INFO_TYPES.has(type)) return toast.info
  return toast.success
}
