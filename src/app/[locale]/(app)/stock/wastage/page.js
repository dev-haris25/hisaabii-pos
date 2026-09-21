import { redirect } from '@/i18n/navigation'

/** @deprecated Wastage tab replaced by the day-end report. */
export default async function StockWastageRedirectPage({ params }) {
  const { locale } = await params
  redirect({ href: '/stock/day-end', locale })
}
