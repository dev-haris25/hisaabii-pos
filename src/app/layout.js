import { IBM_Plex_Sans_Arabic, Inter, Manrope } from 'next/font/google'
import { getLocale } from 'next-intl/server'

import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
})

const ibmPlexArabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ibm-arabic',
  display: 'swap',
})

export const metadata = {
  title: 'Hisabi POS',
  description: 'ZATCA-compliant point of sale for restaurants',
}

export default async function RootLayout({ children }) {
  const locale = await getLocale()
  const dir = locale === 'ar' ? 'rtl' : 'ltr'

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <body
        data-locale={locale}
        dir={dir}
        className={`${inter.variable} ${manrope.variable} ${ibmPlexArabic.variable} antialiased`}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  )
}
