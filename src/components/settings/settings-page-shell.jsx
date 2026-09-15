'use client'

import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useMemo } from 'react'

import { useAppAbility } from '@/components/rbac/ability-provider'
import { Link } from '@/i18n/navigation'
import { hasFullAccess } from '@/lib/rbac/ability-utils'
import { cn } from '@/lib/utils'

const SETTINGS_LINKS = [
  { href: '/settings/profile', labelKey: 'subNavProfile', always: true },
  {
    href: '/settings/restaurant',
    labelKey: 'subNavRestaurant',
    subject: 'BusinessSettings',
  },
  {
    href: '/settings/data',
    labelKey: 'subNavData',
    subject: 'BusinessSettings',
  },
]

/**
 * @param {{ title: string, subtitle?: string, children: import('react').ReactNode }} props
 */
export function SettingsPageShell({ title, subtitle, children }) {
  const t = useTranslations('Settings')
  const pathname = usePathname()
  const ability = useAppAbility()
  const pathWithoutLocale = pathname.replace(/^\/(en|ar)/, '') || '/'

  const visibleLinks = useMemo(
    () =>
      SETTINGS_LINKS.filter((link) => {
        if (link.always) return true
        if (hasFullAccess(ability)) return true
        if (link.subject) return ability.can('read', link.subject)
        return true
      }),
    [ability],
  )

  return (
    <div className="mx-auto w-full max-w-hisabi-container pb-hisabi-xxl">
      <header className="mb-hisabi-xl space-y-1">
        <h1 className="type-headline-xl text-hisabi-on-surface tracking-tight">{title}</h1>
        {subtitle ? (
          <p className="type-body-md text-hisabi-on-surface-variant max-w-2xl">{subtitle}</p>
        ) : null}
      </header>

      <nav
        className="mb-hisabi-xl flex flex-wrap gap-hisabi-xs border-b border-hisabi-outline-variant/20"
        aria-label={t('settingsNavAria')}
      >
        {visibleLinks.map((link) => {
          const active =
            pathWithoutLocale === link.href ||
            pathWithoutLocale.startsWith(`${link.href}/`)
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'type-label-md -mb-px border-b-2 px-hisabi-md py-hisabi-sm transition-colors',
                active
                  ? 'border-hisabi-primary font-semibold text-hisabi-primary'
                  : 'border-transparent text-hisabi-on-surface-variant hover:border-hisabi-outline-variant/50 hover:text-hisabi-on-surface',
              )}
            >
              {t(link.labelKey)}
            </Link>
          )
        })}
      </nav>

      <div className="space-y-hisabi-xl">{children}</div>
    </div>
  )
}

export const fieldClass =
  'type-body-md text-hisabi-on-surface placeholder:text-hisabi-outline/70 w-full rounded-lg border border-hisabi-outline-variant bg-hisabi-surface-container-lowest px-hisabi-md py-3 outline-none transition-shadow focus:border-hisabi-primary focus:ring-1 focus:ring-hisabi-primary/15'

export const fieldInvalidClass =
  'border-hisabi-error focus:border-hisabi-error focus:ring-hisabi-error/25'

export const selectClass =
  'type-body-md text-hisabi-on-surface w-full appearance-none rounded-lg border border-hisabi-outline-variant bg-hisabi-surface-container-lowest px-hisabi-md py-3 pe-10 outline-none transition-shadow focus:border-hisabi-primary focus:ring-1 focus:ring-hisabi-primary/15'

export const labelClass = 'type-label-md text-hisabi-on-surface-variant mb-hisabi-xs block'

/**
 * @param {{
 *   label: import('react').ReactNode
 *   hint?: string
 *   error?: string
 *   errorId?: string
 *   children: import('react').ReactNode
 *   className?: string
 * }} props
 */
export function SettingsField({ label, hint, error, errorId, children, className }) {
  return (
    <div className={cn('space-y-hisabi-xs', className)}>
      <label className={labelClass}>{label}</label>
      {children}
      {error ? (
        <p
          id={errorId}
          className="type-body-sm text-hisabi-error"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {hint ? (
        <p className="type-body-sm text-hisabi-on-surface-variant">{hint}</p>
      ) : null}
    </div>
  )
}

/**
 * @param {{
 *   title: string
 *   icon?: import('lucide-react').LucideIcon
 *   actions?: import('react').ReactNode
 *   children: import('react').ReactNode
 *   className?: string
 * }} props
 */
export function SettingsSection({ title, icon: Icon, actions, children, className }) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-xl border border-hisabi-outline-variant/30 bg-hisabi-surface-container-lowest shadow-sm',
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-hisabi-md border-b border-hisabi-outline-variant/20 px-hisabi-xl py-hisabi-lg sm:px-hisabi-xxl">
        <div className="flex min-w-0 items-center gap-hisabi-md">
          {Icon ? (
            <span
              className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-hisabi-secondary-fixed text-hisabi-primary shadow-hisabi-1"
              aria-hidden
            >
              <Icon className="size-5" aria-hidden />
            </span>
          ) : null}
          <h2 className="type-headline-md font-bold text-hisabi-primary">{title}</h2>
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-hisabi-sm">{actions}</div> : null}
      </div>
      <div className="space-y-hisabi-xl px-hisabi-xl pb-hisabi-xl pt-hisabi-md sm:px-hisabi-xxl sm:pb-hisabi-xxl sm:pt-hisabi-lg">
        {children}
      </div>
    </section>
  )
}

/**
 * @param {{ children: import('react').ReactNode, className?: string }} props
 */
export function SettingsFormFooter({ children, className }) {
  return (
    <div
      className={cn(
        'flex w-full flex-col-reverse gap-hisabi-md border-t border-hisabi-outline-variant/20 pt-hisabi-xl min-[500px]:flex-row min-[500px]:justify-end min-[500px]:gap-hisabi-xl',
        className,
      )}
    >
      {children}
    </div>
  )
}
