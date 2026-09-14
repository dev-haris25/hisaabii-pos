import { useAuthStore } from '@/stores/auth-store'

/**
 * Keep React Query and Zustand auth session in sync after /me resolves.
 *
 * @param {import('@tanstack/react-query').QueryClient} queryClient
 * @param {{ user?: import('@/stores/auth-store').AuthUser } | null | undefined} me
 */
export function syncAuthMeSession(queryClient, me) {
  queryClient.setQueryData(['auth', 'me'], me)
  const user = me?.user ?? null
  if (user) {
    useAuthStore.getState().setUser(user)
  }
}
