import { redirect } from '@/i18n/navigation'

/** @deprecated Daily allotment replaced by the day-end report. */
export default async function StockAllotmentRedirectPage({ params }) {
  const { locale } = await params
  redirect({ href: '/stock/day-end', locale })
}
