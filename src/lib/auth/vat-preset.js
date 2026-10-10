import { vatPercentForPreset } from '@/lib/invoices/invoice-compute-totals'

/**
 * Map defaultVatPreset from the shared BusinessProfile form to stored percent.
 * @param {'standard' | 'zero' | 'exempt'} preset
 */
export function defaultVatPercentFromPreset(preset) {
  return String(vatPercentForPreset(preset))
}
