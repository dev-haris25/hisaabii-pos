'use client'

import { HisabiSpinner } from '@/components/hisabi-spinner'
import { cn } from '@/lib/utils'

/**
 * Small inline spinner shown next to (or inside) a field label while that field's
 * value is being auto-filled from an API call triggered by a dropdown selection.
 *
 * Mirrors the English→Arabic translation loader for a consistent experience.
 *
 * @param {{ loading?: boolean, label?: string, className?: string }} props
 */
export function FieldAutofillSpinner({ loading = false, label, className }) {
  if (!loading) return null
  return (
    <HisabiSpinner
      size="inline"
      label={label}
      className={cn('text-hisabi-teal', className)}
    />
  )
}
