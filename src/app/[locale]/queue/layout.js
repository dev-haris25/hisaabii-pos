import { setRequestLocale } from 'next-intl/server'

export default async function QueueLayout({ children, params }) {
  const { locale } = await params
  setRequestLocale(locale)
  return children
}
