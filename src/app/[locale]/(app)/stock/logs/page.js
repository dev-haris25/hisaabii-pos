import { redirect } from '@/i18n/navigation'

/** @deprecated Daily usage log replaced by the day-end report. */
export default async function StockLogsRedirectPage({ params }) {
  const { locale } = await params
  redirect({ href: '/stock/day-end', locale })
}
