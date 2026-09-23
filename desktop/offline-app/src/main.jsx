import { StrictMode, useCallback, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NextIntlClientProvider } from 'next-intl'
import { Toaster } from 'sonner'

import { OfflineNavProvider } from './shims/i18n-navigation.jsx'
import { OfflineApp } from './OfflineApp.jsx'
import { OfflineErrorBoundary } from './ErrorBoundary.jsx'
import './styles.css'

import enMessages from '../../../messages/en.json'
import arMessages from '../../../messages/ar.json'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

function Root() {
  const [locale, setLocale] = useState(() => {
    try {
      return localStorage.getItem('hisabi-offline-locale') === 'ar' ? 'ar' : 'en'
    } catch {
      return 'en'
    }
  })
  const [path, setPath] = useState('/pos')

  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr'
    try {
      localStorage.setItem('hisabi-offline-locale', locale)
    } catch {
      /* ignore */
    }
  }, [locale])

  const messages = useMemo(
    () => (locale === 'ar' ? arMessages : enMessages),
    [locale],
  )

  const setLocaleStable = useCallback((next) => {
    setLocale(next === 'ar' ? 'ar' : 'en')
  }, [])

  return (
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Riyadh">
          <OfflineNavProvider
            locale={locale}
            setLocale={setLocaleStable}
            path={path}
            setPath={setPath}
          >
            <OfflineErrorBoundary>
              <OfflineApp path={path} setPath={setPath} />
            </OfflineErrorBoundary>
            <Toaster richColors position="top-center" />
          </OfflineNavProvider>
        </NextIntlClientProvider>
      </QueryClientProvider>
    </StrictMode>
  )
}

createRoot(document.getElementById('root')).render(<Root />)
