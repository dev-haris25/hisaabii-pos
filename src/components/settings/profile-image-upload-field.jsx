'use client'

/* eslint-disable @next/next/no-img-element -- image previews (blob + authenticated API URLs) */

import { Upload } from 'lucide-react'

/**
 * Upload / replace / remove block for logo images (Hisabi parity).
 *
 * @param {{
 *   id: string
 *   label: string
 *   hint: string
 *   inputRef: React.MutableRefObject<HTMLInputElement | null>
 *   file: File | null
 *   previewUrl: string | null
 *   showServerImage: boolean
 *   serverSrc: string | null
 *   uploadError: boolean
 *   canUpdate: boolean
 *   tooLargeMessage: string
 *   replaceLabel: string
 *   removeLabel: string
 *   onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
 *   onRemove: () => void
 * }} props
 */
export function ProfileImageUploadField({
  id,
  label,
  hint,
  inputRef,
  file,
  previewUrl,
  showServerImage,
  serverSrc,
  uploadError,
  canUpdate,
  tooLargeMessage,
  replaceLabel,
  removeLabel,
  onChange,
  onRemove,
}) {
  return (
    <div className="space-y-hisabi-xs">
      <label className="type-label-md text-hisabi-on-surface-variant block" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,.png,.jpg,.jpeg,.gif,.webp"
        className="sr-only"
        onChange={onChange}
        disabled={!canUpdate}
      />
      {previewUrl && file ? (
        <div className="border-hisabi-outline-variant flex w-full flex-col items-center gap-hisabi-md rounded-xl border-2 border-dashed bg-hisabi-surface-container-lowest p-hisabi-xl">
          <div className="border-hisabi-outline-variant relative flex min-h-[120px] w-full max-w-xs flex-1 items-center justify-center overflow-hidden rounded-xl border bg-hisabi-surface-container p-hisabi-sm shadow-sm">
            <img
              src={previewUrl}
              alt=""
              className="max-h-40 w-auto max-w-full object-contain"
            />
          </div>
          <div className="flex flex-wrap items-center justify-center gap-hisabi-sm">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="type-label-md border-hisabi-teal-container text-hisabi-teal hover:bg-hisabi-teal-container/10 rounded-xl border-2 px-hisabi-lg py-2 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              {replaceLabel}
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="type-label-md text-hisabi-outline hover:text-hisabi-error rounded-xl border-2 border-transparent px-hisabi-lg py-2 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              {removeLabel}
            </button>
          </div>
        </div>
      ) : showServerImage && serverSrc ? (
        <div className="border-hisabi-outline-variant flex w-full flex-col items-center gap-hisabi-md rounded-xl border-2 border-dashed bg-hisabi-surface-container-lowest p-hisabi-xl">
          <div className="border-hisabi-outline-variant relative flex min-h-[120px] w-full max-w-xs flex-1 items-center justify-center overflow-hidden rounded-xl border bg-hisabi-surface-container p-hisabi-sm shadow-sm">
            <img
              src={serverSrc}
              alt=""
              className="max-h-40 w-auto max-w-full object-contain"
            />
          </div>
          <div className="flex flex-wrap items-center justify-center gap-hisabi-sm">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="type-label-md border-hisabi-teal-container text-hisabi-teal hover:bg-hisabi-teal-container/10 rounded-xl border-2 px-hisabi-lg py-2 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              {replaceLabel}
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="type-label-md text-hisabi-outline hover:text-hisabi-error rounded-xl border-2 border-transparent px-hisabi-lg py-2 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              {removeLabel}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={!canUpdate}
          className="border-hisabi-outline-variant hover:border-hisabi-teal-container group flex w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed bg-hisabi-surface-container-lowest p-hisabi-xl transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          <div className="mb-hisabi-md flex size-14 items-center justify-center rounded-full bg-hisabi-surface-container transition-colors group-hover:bg-hisabi-primary-fixed/40">
            <Upload className="size-7 text-hisabi-teal" aria-hidden />
          </div>
          <p className="type-label-md text-hisabi-on-surface-variant">{hint}</p>
        </button>
      )}
      {uploadError ? (
        <p className="type-body-sm text-hisabi-error" role="alert">
          {tooLargeMessage}
        </p>
      ) : null}
    </div>
  )
}
