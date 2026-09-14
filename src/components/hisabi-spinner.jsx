'use client'

import { Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Shared Lucide spinner — auth buttons use `size="button"`; full-page loaders use `size="page"`.
 */
export function HisabiSpinner({ size = 'button', className }) {
  const dim = size === 'page' ? 'size-11' : 'size-6'
  return (
    <Loader2
      className={cn(dim, 'shrink-0 animate-spin', className)}
      aria-hidden
    />
  )
}
