import { Suspense } from 'react'
import { createMongoAbility } from '@casl/ability'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound, redirect } from 'next/navigation'

import { CustomerDetailView } from '../../customer-detail-view'
import { AppLoader } from '@/components/app-loader'
import { requireAdminAppUser } from '@/lib/auth/require-admin-app-user'
import { computeLoyaltyAccountStats } from '@/lib/loyalty/compute-loyalty-account-stats'
import { loadOwnedLoyaltyAccount } from '@/lib/loyalty/load-owned-loyalty-account'
import { mapLoyaltyAccountToJson } from '@/lib/loyalty/map-loyalty-account-json'
import {
  queryLoyaltyCustomerInvoicesPage,
  queryLoyaltyCustomerTransactionsPage,
} from '@/lib/loyalty/query-loyalty-customer-nested'
import { prisma } from '@/lib/prisma'
import { hasFullAccess } from '@/lib/rbac/ability-utils'

export async function generateMetadata({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('Loyalty')
  return { title: t('customerDetailMetaTitle') }
}

/**
 * @param {{
 *   params: Promise<{ locale: string, id: string }>
 *   searchParams: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>
 * }} props
 */
export default async function LoyaltyCustomerDetailPage({
  params,
  searchParams,
}) {
  const { locale, id } = await params
  setRequestLocale(locale)
  const user = await requireAdminAppUser()

  const ability = createMongoAbility(user.abilityRules ?? [])
  if (!hasFullAccess(ability) && !ability.can('read', 'Loyalty')) {
    redirect(`/${locale}`)
  }

  const account = await loadOwnedLoyaltyAccount(user.businessProfileId, id)
  if (!account) notFound()

  const [invoicesForStats, transactionsForStats] = await Promise.all([
    prisma.invoice.findMany({
      where: { loyaltyAccountId: id, businessProfileId: user.businessProfileId },
      select: { grandTotal: true },
    }),
    prisma.loyaltyTransaction.findMany({
      where: { accountId: id },
      select: { type: true, points: true },
    }),
  ])
  const stats = computeLoyaltyAccountStats({
    invoices: invoicesForStats,
    transactions: transactionsForStats,
  })

  const sp = searchParams instanceof Promise ? await searchParams : searchParams
  const urlParams = new URLSearchParams()
  for (const [k, v] of Object.entries(sp ?? {})) {
    if (typeof v === 'string') urlParams.set(k, v)
  }

  const invoicesPage = urlParams.get('invoicesPage') ?? '1'
  const invoicesLimit = urlParams.get('invoicesLimit') ?? '10'
  const transactionsPage = urlParams.get('transactionsPage') ?? '1'
  const transactionsLimit = urlParams.get('transactionsLimit') ?? '10'

  const invoicesParams = new URLSearchParams()
  invoicesParams.set('page', invoicesPage)
  invoicesParams.set('limit', invoicesLimit)

  const transactionsParams = new URLSearchParams()
  transactionsParams.set('page', transactionsPage)
  transactionsParams.set('limit', transactionsLimit)

  const [invoicesResult, transactionsResult] = await Promise.all([
    queryLoyaltyCustomerInvoicesPage({
      accountId: id,
      businessProfileId: user.businessProfileId,
      searchParams: invoicesParams,
    }),
    queryLoyaltyCustomerTransactionsPage({
      accountId: id,
      searchParams: transactionsParams,
    }),
  ])

  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-hisabi-xxl">
          <AppLoader />
        </div>
      }
    >
      <CustomerDetailView
        customer={mapLoyaltyAccountToJson(account)}
        stats={stats}
        invoices={invoicesResult.invoices}
        invoicesPagination={invoicesResult.pagination}
        invoicesFilters={{
          invoicesPage: Number.parseInt(invoicesPage, 10) || 1,
          invoicesLimit: Number.parseInt(invoicesLimit, 10) || 10,
        }}
        transactions={transactionsResult.transactions}
        transactionsPagination={transactionsResult.pagination}
        transactionsFilters={{
          transactionsPage: Number.parseInt(transactionsPage, 10) || 1,
          transactionsLimit: Number.parseInt(transactionsLimit, 10) || 10,
        }}
      />
    </Suspense>
  )
}
