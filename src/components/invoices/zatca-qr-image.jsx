'use client'

import QRCode from 'qrcode'
import { useEffect, useState } from 'react'

/**
 * Phase-2 TLV payloads are long (~640+ char base64 → QR ~v20 / ~97 modules).
 * Empirical jsQR tests: 104px fails; ≥300px bitmap survives Puppeteer PDF
 * `scale: 0.75` (effective ~225px). Keep ECL M — Q bumps to ~v24 / denser
 * modules and offsets the size gain.
 */
export const ZATCA_QR_BITMAP_PX = 400

/** On-page CSS box. 300px × 0.75 PDF scale ≈ 225px effective print size. */
export const ZATCA_QR_DISPLAY_PX = 300

/**
 * Renders a ZATCA Phase 1/2 QR from its base64 TLV payload.
 * Must encode the payload directly — not via a third-party QR image URL.
 *
 * @param {{
 *   payload: string | null | undefined
 *   size?: number
 *   className?: string
 *   fallback?: import('react').ReactNode
 * }} props
 */
export function ZatcaQrImage({
  payload,
  size = ZATCA_QR_BITMAP_PX,
  className,
  fallback = null,
}) {
  const [src, setSrc] = useState(/** @type {string | null} */ (null))
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const trimmed = payload?.trim()
    if (!trimmed) {
      setSrc(null)
      setFailed(false)
      return
    }

    let cancelled = false
    setFailed(false)

    QRCode.toDataURL(trimmed, {
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#FFFFFF' },
    })
      .then((url) => {
        if (!cancelled) setSrc(url)
      })
      .catch(() => {
        if (!cancelled) {
          setSrc(null)
          setFailed(true)
        }
      })

    return () => {
      cancelled = true
    }
  }, [payload, size])

  if (!payload?.trim() || failed || !src) {
    return fallback
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- data URL from TLV payload
    <img src={src} alt="" className={className} />
  )
}
