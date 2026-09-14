'use client'

import { ArrowLeft } from 'lucide-react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'

import { AuthLocaleToggle } from '@/components/auth/auth-locale-toggle'
import { AuthPageFooter } from '@/components/auth/auth-page-footer'
import { Link, useRouter } from '@/i18n/navigation'

/**
 * Public long-form legal page chrome: logo header, article body, AuthPageFooter.
 * Prefer this over AuthSplitShell for multi-section documents.
 *
 * @param {{
 *   namespace: 'PrivacyPolicy' | 'TermsOfService'
 *   sectionIds: string[]
 * }} props
 */
export function LegalDocumentShell({ namespace, sectionIds }) {
  const t = useTranslations(namespace)
  const tBrand = useTranslations('Pricing')
  const router = useRouter()

  return (
    <main className="type-body-md text-hisabi-ink flex min-h-dvh flex-col bg-hisabi-background">
      <header className="border-hisabi-outline-variant/30 flex shrink-0 items-center justify-between border-b bg-hisabi-surface-container-lowest px-hisabi-margin-mobile py-hisabi-md md:px-hisabi-margin-desktop">
        <Link href="/" className="inline-flex items-center">
          <Image
            src="/images/hisabi-logo-light.png"
            alt={tBrand('brand')}
            width={84}
            height={32}
            className="h-8 w-auto"
            priority
          />
        </Link>
        <AuthLocaleToggle />
      </header>

      <article className="mx-auto w-full max-w-3xl flex-1 px-hisabi-margin-mobile py-hisabi-xl md:px-hisabi-margin-desktop md:py-hisabi-xxl">
        <button
          type="button"
          onClick={() => router.back()}
          className="type-label-md text-hisabi-on-surface-variant hover:text-hisabi-on-surface mb-hisabi-lg inline-flex min-h-hisabi-btn w-fit cursor-pointer items-center gap-hisabi-sm rounded-xl px-hisabi-sm transition-colors"
        >
          <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
          {t('back')}
        </button>

        <h1 className="type-headline-xl mb-hisabi-sm tracking-tight text-hisabi-on-surface">
          {t('title')}
        </h1>
        <p className="type-body-sm text-hisabi-on-surface-variant mb-hisabi-xl">
          {t('lastUpdated', { date: t('lastUpdatedDate') })}
        </p>

        <div className="space-y-hisabi-xl">
          {sectionIds.map((id) => {
            const paragraphs = t.raw(`sections.${id}.paragraphs`)
            const list =
              Array.isArray(paragraphs) && paragraphs.every((p) => typeof p === 'string')
                ? paragraphs
                : []
            return (
              <section key={id} className="space-y-hisabi-sm">
                <h2 className="type-headline-md text-hisabi-on-surface">{t(`sections.${id}.title`)}</h2>
                {list.map((para, i) => (
                  <p key={`${id}-${i}`} className="type-body-md text-hisabi-on-surface-variant leading-relaxed">
                    {para}
                  </p>
                ))}
              </section>
            )
          })}
        </div>
      </article>

      <div className="mt-auto shrink-0 px-hisabi-margin-mobile pb-hisabi-xl md:px-hisabi-margin-desktop">
        <AuthPageFooter />
      </div>
    </main>
  )
}
