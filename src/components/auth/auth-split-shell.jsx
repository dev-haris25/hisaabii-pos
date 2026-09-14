'use client'

import Image from 'next/image'
import { useTranslations } from 'next-intl'

import { AuthLocaleToggle } from '@/components/auth/auth-locale-toggle'
import { AuthPageFooter } from '@/components/auth/auth-page-footer'

const HERO_IMAGE =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuB-NsH_KiqlP7PBT2nrhHjt5WwysqHjDu5yxrUIbtfGpRWYOkGbJIxCzp1YTV-GyzMlENAcwJocCKRI3A503WnhMDI9ct-RCmmo6hDlVhicbb0yzdS7y2AkCGtQSu3FH-XblSido3kkdUZXrkV2gd7cS5MXuuFHxygX4CMjOZR2Dub5B9rFKuoA2QIjTDqRam6AtKMAWJBQ4w3drs2psJ3TMsmFuimhaocQxrvJi07O2r4WYWPFY5WmBcJx7GEDMf1Kr25sfNGOdLA'

/**
 * Shared split layout for login / register / reset password: geometric brand panel + form column.
 * Copy comes from `namespace`; pass form + extra blocks as children.
 * Footer always matches the login screen (see AuthPageFooter).
 */
export function AuthSplitShell({
  namespace,
  children,
  showHeaderWordmark = true,
  titleClassName = 'type-headline-lg text-hisabi-teal mb-hisabi-xs',
  subtitleClassName = 'type-body-md text-hisabi-outline',
}) {
  const t = useTranslations(namespace)

  return (
    <main className="type-body-md text-hisabi-ink flex min-h-dvh flex-col overflow-x-hidden bg-hisabi-background md:flex-row">
      <section className="hisabi-geometric-panel relative hidden min-h-dvh w-1/2 shrink-0 flex-col items-center justify-center overflow-hidden md:flex">
        <div className="absolute -top-32 -right-32 size-64 rounded-full bg-hisabi-teal-container/20 blur-3xl" />
        <div className="absolute -bottom-48 -left-48 size-96 rounded-full bg-hisabi-gold-muted/5 blur-3xl" />

        <div className="relative z-10 space-y-hisabi-xl px-hisabi-xl text-center">
          <div className="flex flex-col items-center">
            <Image
              src="/images/hisabi-logo-dark.png"
              alt={t('brandWordmark')}
              width={126}
              height={48}
              className="h-12 w-auto"
              priority
            />
          </div>
          <div className="space-y-hisabi-sm">
            <h2 className="type-headline-md tracking-[0.2em] text-hisabi-gold-muted uppercase opacity-90">
              {t('brandHeadline')}
            </h2>
            <div className="mx-auto h-1 w-16 rounded-full bg-hisabi-secondary" />
          </div>
          <p className="type-body-lg text-hisabi-on-primary/70 mx-auto max-w-sm leading-relaxed italic">
            {t('brandBody')}
          </p>
        </div>

        <div className="pointer-events-none absolute inset-0 opacity-20 mix-blend-overlay">
          <Image
            src={HERO_IMAGE}
            alt=""
            fill
            className="object-cover"
            sizes="50vw"
            priority={false}
          />
        </div>
      </section>

      <section className="relative flex min-h-dvh w-full flex-1 flex-col bg-hisabi-surface-container-lowest px-hisabi-margin-mobile py-hisabi-xl md:w-1/2 md:px-hisabi-margin-desktop">
        <header
          className={
            showHeaderWordmark
              ? 'mb-hisabi-xxl flex shrink-0 items-center justify-between'
              : 'mb-hisabi-xxl flex shrink-0 items-center justify-end'
          }
        >
          {showHeaderWordmark ? (
            <Image
              src="/images/hisabi-logo-light.png"
              alt={t('brandWordmark')}
              width={84}
              height={32}
              className="h-8 w-auto"
              priority
            />
          ) : null}
          <AuthLocaleToggle />
        </header>

        <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col justify-center overflow-y-auto px-1 py-hisabi-md sm:px-2">
          <div className="mb-hisabi-xl shrink-0">
            <h1 className={titleClassName}>{t('title')}</h1>
            <p className={subtitleClassName}>{t('subtitle')}</p>
          </div>

          {children}
        </div>

        <AuthPageFooter />
      </section>
    </main>
  )
}
