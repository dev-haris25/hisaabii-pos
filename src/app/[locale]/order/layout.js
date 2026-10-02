import { setRequestLocale } from 'next-intl/server'

export default async function OrderLayout({ children, params }) {
  const { locale } = await params
  setRequestLocale(locale)
  return children
}
