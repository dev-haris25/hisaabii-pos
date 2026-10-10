'use client'

import { Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Size → design-system class. All sizes track `--hisabi-ui-scale` (clamp-based).
 * - `inline` — compact spinner for buttons, field labels and small inline spots (16px @1x)
 * - `sm` — row-action icon buttons / larger CTA icons (20px @1x)
 * - `md` / `button` — auth CTAs (24px @1x; `button` kept for backward compatibility)
 * - `lg` — list / section loaders (32px @1x)
 * - `page` — full-page loaders
 */
const SIZE_CLASS = {
  inline: 'size-hisabi-icon-sm',
  sm: 'size-hisabi-icon-md',
  md: 'size-6',
  button: 'size-6',
  lg: 'size-hisabi-icon-xl',
  page: 'size-11',
}

/**
 * The single shared spinner glyph (rules §12). Prefer `AppLoader` for area/page loading;
 * use this directly only inside buttons and other small inline spots.
 *
 * Decorative (`aria-hidden`) by default. Pass `label` when the spinner is the only
 * loading cue so it is announced as `role="status"`.
 *
 * @param {{
 *   size?: 'inline' | 'sm' | 'md' | 'button' | 'lg' | 'page'
 *   label?: string
 *   className?: string
 * }} props
 */
export function HisabiSpinner({ size = 'button', label, className }) {
  const dim = SIZE_CLASS[size] ?? SIZE_CLASS.button
  const a11y = label
    ? { role: 'status', 'aria-label': label }
    : { 'aria-hidden': true }
  return <Loader2 className={cn(dim, 'shrink-0 animate-spin', className)} {...a11y} />
}
