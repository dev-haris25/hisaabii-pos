import { redirect } from '@/i18n/navigation'

/** @deprecated Kitchen issue boxes replaced by deduct-on-ready + day-end report. */
export default async function StockKitchenRedirectPage({ params }) {
  const { locale } = await params
  redirect({ href: '/stock/day-end', locale })
}
