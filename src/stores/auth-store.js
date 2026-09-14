import { create } from 'zustand'

/**
 * @typedef {{
 *   id: string
 *   email: string
 *   name: string
 *   needsBusinessProfileOnboarding?: boolean
 *   needsZatcaOnboarding?: boolean
 *   zatcaOnboardingSkippedEffective?: boolean
 *   hasBusinessProfile?: boolean
 *   activeBusinessProfileId?: string | null
 *   businessProfileOnboardingSkipped?: boolean
 *   showBusinessProfileCompletionReminder?: boolean
 *   productTourSeenAt?: string | null
 *   abilityRules?: Array<Record<string, unknown>>
 *   roleName?: string | null
 *   roleNames?: string[]
 *   isRestaurantOwner?: boolean
 * } | null} AuthUser
 */

export const useAuthStore = create((set) => ({
  /** @type {AuthUser} */
  user: null,
  setUser: (user) => set({ user }),
  clearUser: () => set({ user: null }),
}))
