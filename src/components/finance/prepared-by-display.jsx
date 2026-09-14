'use client'

/* eslint-disable @next/next/no-img-element -- document signoff images */

/**
 * Shared Prepared By cell content: signature image, else plain-text name.
 *
 * @param {{
 *   imageUrl?: string | null
 *   name?: string | null
 *   className?: string
 * }} props
 */
export function PreparedByDisplay({ imageUrl, name, className }) {
  const trimmedName = typeof name === 'string' ? name.trim() : ''
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        className={className ?? 'max-h-full max-w-full object-contain'}
      />
    )
  }
  if (trimmedName) {
    return (
      <p className="type-body-sm text-hisabi-on-surface text-center font-semibold">
        {trimmedName}
      </p>
    )
  }
  return null
}

/**
 * @param {string | null | undefined} preparedBySignatureUrl
 * @param {string | null | undefined} createdByName
 * @returns {{ imageUrl: string | null, fallbackText: string | null }}
 */
export function resolvePreparedByDisplay(preparedBySignatureUrl, createdByName) {
  const imageUrl =
    typeof preparedBySignatureUrl === 'string' && preparedBySignatureUrl.trim()
      ? preparedBySignatureUrl.trim()
      : null
  const fallbackText =
    !imageUrl && typeof createdByName === 'string' && createdByName.trim()
      ? createdByName.trim()
      : null
  return { imageUrl, fallbackText }
}
