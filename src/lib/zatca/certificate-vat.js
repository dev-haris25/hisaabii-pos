import { X509Certificate } from 'node:crypto'

import { asCertificatePem } from '@talha7k/zatca'

import { isValidZatcaVatNumber } from '@/lib/zatca/env'

/**
 * Extract the 15-digit VAT number embedded in a ZATCA CSID certificate.
 * Sandbox production CSIDs use CN like `TST-886431145-399999999900003`.
 *
 * @param {string} certificateRaw PEM or base64 DER
 * @returns {string | null}
 */
export function extractVatFromZatcaCertificate(certificateRaw) {
  if (!certificateRaw?.trim()) return null

  try {
    const cert = new X509Certificate(asCertificatePem(certificateRaw))
    const cn = cert.subject.match(/CN=([^,\n]+)/)?.[1]?.trim() ?? ''
    const segments = cn.split('-')
    for (let i = segments.length - 1; i >= 0; i -= 1) {
      const digits = segments[i].replace(/\D/g, '')
      if (isValidZatcaVatNumber(digits)) return digits
    }

    const subjectDigits = cert.subject.replace(/\D/g, '')
    const match = subjectDigits.match(/3\d{13}3/)
    return match?.[0] ?? null
  } catch {
    return null
  }
}
