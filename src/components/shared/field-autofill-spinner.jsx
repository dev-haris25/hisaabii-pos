'use client'

import { Loader2 } from 'lucide-react'

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
    <Loader2
      className={cn('text-hisabi-teal size-4 shrink-0 animate-spin', className)}
      aria-label={label}
      role="status"
    />
  )
}
