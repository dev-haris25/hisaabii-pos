'use client'

import { CloudUpload } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useId } from 'react'
import { toast } from 'sonner'

import { COMPANY_LOGO_MIME_TYPES, MAX_MENU_ITEM_IMAGE_BYTES } from '@/lib/auth/company-logo'
import { readLogoFileAsBase64 } from '@/lib/clients/read-logo-file-as-base64'
import { cn } from '@/lib/utils'

const IMAGE_ACCEPT = COMPANY_LOGO_MIME_TYPES.join(',')

/**
 * @typedef {null | 'clear' | { base64: string, mime: string }} OfferImageNext
 */

/**
 * Optional image picker (base64, same UX as the menu item image).
 *
 * @param {{
 *   label: string
 *   hint: string
 *   dropHint: string
 *   existingUrl: string | null
 *   value: OfferImageNext
 *   onChange: (next: OfferImageNext) => void
 *   variant: 'banner' | 'product'
 *   disabled?: boolean
 * }} props
 */
export function OfferImageField({
  label,
  hint,
  dropHint,
  existingUrl,
  value,
  onChange,
  variant,
  disabled = false,
}) {
  const t = useTranslations('Offers')
  const inputId = useId()

  const previewSrc =
    value && typeof value === 'object'
      ? `data:${value.mime};base64,${value.base64}`
      : value === 'clear'
        ? null
        : existingUrl

  const hasImage = Boolean(existingUrl && !value) || Boolean(value)

  return (
    <div className="min-w-0 space-y-hisabi-xs">
      <p className="type-label-md text-hisabi-on-surface-variant text-start">
        {label}
      </p>
      <label
        htmlFor={inputId}
        className={cn(
          'offer-image-drop border-hisabi-outline-variant text-hisabi-on-surface-variant hover:border-hisabi-primary flex cursor-pointer flex-col items-center justify-center gap-hisabi-xs rounded-xl border-2 border-dashed bg-hisabi-surface p-hisabi-lg transition-colors',
          disabled && 'pointer-events-none opacity-60',
        )}
      >
        {previewSrc ? (
          // eslint-disable-next-line @next/next/no-img-element -- local/data preview
          <img
            src={previewSrc}
            alt=""
            className={
              variant === 'banner'
                ? 'offer-banner-preview rounded-lg'
                : 'offer-product-preview rounded-lg'
            }
          />
        ) : (
          <>
            <CloudUpload className="size-8" aria-hidden />
            <span className="type-body-sm text-center">{dropHint}</span>
          </>
        )}
        <input
          id={inputId}
          type="file"
          accept={IMAGE_ACCEPT}
          className="sr-only"
          disabled={disabled}
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            try {
              const { base64, mime } = await readLogoFileAsBase64(f, {
                maxBytes: MAX_MENU_ITEM_IMAGE_BYTES,
              })
              onChange({ base64, mime })
            } catch (err) {
              const msg = err instanceof Error ? err.message : ''
              toast.error(
                msg === 'logo too large'
                  ? t('imageTooLarge')
                  : msg === 'invalid logo type'
                    ? t('imageInvalidType')
                    : t('imagePickError'),
              )
            }
          }}
        />
      </label>
      <p className="type-body-sm text-hisabi-on-surface-variant">{hint}</p>
      {hasImage ? (
        <div className="flex flex-wrap gap-hisabi-sm">
          {value === 'clear' ? (
            <button
              type="button"
              className="type-label-sm text-hisabi-primary cursor-pointer hover:underline"
              onClick={() => onChange(null)}
            >
              {t('undoRemoveImage')}
            </button>
          ) : (
            <>
              <button
                type="button"
                className="type-label-sm text-hisabi-error cursor-pointer hover:underline"
                onClick={() =>
                  onChange(value && typeof value === 'object' ? null : 'clear')
                }
              >
                {t('removeImage')}
              </button>
              <button
                type="button"
                className="type-label-sm text-hisabi-primary cursor-pointer hover:underline"
                onClick={() => document.getElementById(inputId)?.click()}
              >
                {t('replaceImage')}
              </button>
            </>
          )}
        </div>
      ) : null}
      {value === 'clear' ? (
        <p className="type-body-sm text-hisabi-on-surface-variant">
          {t('imageRemovedOnSave')}
        </p>
      ) : null}
    </div>
  )
}
