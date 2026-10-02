import { toast } from 'sonner'

const ERROR_TYPES = new Set([
  'zatca_report_failed',
  'zatca_report_still_failed',
  'salary_cap_exceeded',
  'visa_expired',
])

const WARNING_TYPES = new Set([
  'zatca_report_pending',
  'visa_expiring',
  'salary_cap_reached',
  'advance_outstanding',
  'invoice_voided',
  'stock_low',
  'kitchen_waste_high',
  'day_end_waste_high',
  'e_waiter_round_cancelled',
])

const INFO_TYPES = new Set(['role_changed', 'member_joined'])

const SUCCESS_TYPES = new Set(['zatca_report_success'])

/**
 * @param {string} type
 */
export function notificationToastFn(type) {
  if (ERROR_TYPES.has(type)) return toast.error
  if (WARNING_TYPES.has(type)) return toast.warning
  if (INFO_TYPES.has(type)) return toast.info
  if (SUCCESS_TYPES.has(type)) return toast.success
  return toast.success
}
