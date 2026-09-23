'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { authGet } from '@/lib/api/auth-client'
import { isAuthUserRbacLoaded } from '@/lib/auth/is-auth-user-rbac-loaded'
import { syncAuthMeSession } from '@/lib/auth/sync-auth-me-session'
import { authGetMePreferOffline } from '@/lib/desktop/desktop-auth'
import { isHisabiDesktop } from '@/lib/desktop/hisabi-desktop'
import { useAuthStore } from '@/stores/auth-store'

export function AuthSessionSync() {
  const queryClient = useQueryClient()

  const { data } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () =>
      isHisabiDesktop() ? authGetMePreferOffline() : authGet('/me'),
    staleTime: 60_000,
  })

  useEffect(() => {
    if (data) {
      syncAuthMeSession(queryClient, data)
    } else {
      useAuthStore.getState().setUser(null)
    }
  }, [data, queryClient])

  // Login and some mutations seed `['auth','me']` without RBAC; with a 60s staleTime that
  // payload would otherwise block refetch and leave the sidebar filtered to Settings only.
  useEffect(() => {
    const user = data?.user
    if (user && !isAuthUserRbacLoaded(user)) {
      void queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
    }
  }, [data?.user, queryClient])

  return null
}
