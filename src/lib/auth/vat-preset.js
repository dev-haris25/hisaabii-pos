/**
 * Map defaultVatPreset from the shared BusinessProfile form to stored percent.
 * @param {'standard' | 'zero' | 'exempt'} preset
 */
export function defaultVatPercentFromPreset(preset) {
  if (preset === 'zero' || preset === 'exempt') return '0'
  return '15'
}
