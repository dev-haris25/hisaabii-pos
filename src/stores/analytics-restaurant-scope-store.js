import { create } from 'zustand'

/**
 * View filter only — does not change the active restaurant.
 * `null` / `active` = currently active restaurant.
 * @typedef {'active' | 'all' | string} AnalyticsRestaurantScope
 */

export const useAnalyticsRestaurantScopeStore = create((set) => ({
  /** @type {AnalyticsRestaurantScope} */
  scope: 'active',
  /** @param {AnalyticsRestaurantScope} scope */
  setScope: (scope) => set({ scope }),
}))
