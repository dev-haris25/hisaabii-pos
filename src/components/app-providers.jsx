'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { Toaster } from 'sonner'

import { AuthSessionSync } from '@/components/auth-session-sync'
import { InternetRequiredProvider } from '@/components/desktop/internet-required-provider'

export function AppProviders({ children }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      <InternetRequiredProvider>
        <AuthSessionSync />
        <Toaster richColors closeButton position="top-center" />
        <Toaster
          id="notifications"
          richColors
          closeButton
          position="bottom-right"
          toastOptions={{ className: 'max-w-sm' }}
        />
        {children}
      </InternetRequiredProvider>
    </QueryClientProvider>
  )
}
