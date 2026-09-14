import { redirect } from 'next/navigation'

export default async function SettingsIndexPage({ params }) {
  const { locale } = await params
  redirect(`/${locale}/settings/profile`)
}
