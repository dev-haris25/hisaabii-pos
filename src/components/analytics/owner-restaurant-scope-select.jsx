'use client'

import { useQuery } from '@tanstack/react-query'
import { ChevronDown } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

import { authGet } from '@/lib/api/auth-client'
import { ANALYTICS_SCOPE_ALL } from '@/lib/auth/analytics-scope-query'
import { companyDisplayNameForLocale } from '@/lib/business-profile/company-display-name'
import { selectClass } from '@/components/settings/settings-page-shell'
import { useAnalyticsRestaurantScopeStore } from '@/stores/analytics-restaurant-scope-store'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'

/**
 * Owner-only restaurant filter for dashboard/reports. Hidden with one restaurant.
 */
export function OwnerRestaurantScopeSelect() {
  const t = useTranslations('AnalyticsScope')
  const locale = useLocale()
  const isRestaurantOwner = useAuthStore((s) => s.user?.isRestaurantOwner === true)
  const activeId = useAuthStore((s) => s.user?.activeBusinessProfileId ?? '')
  const scope = useAnalyticsRestaurantScopeStore((s) => s.scope)
  const setScope = useAnalyticsRestaurantScopeStore((s) => s.setScope)

  const { data } = useQuery({
    queryKey: ['auth', 'business-profiles'],
    queryFn: () => authGet('/business-profiles'),
    enabled: isRestaurantOwner,
  })

  const owned = (Array.isArray(data?.profiles) ? data.profiles : []).filter(
    (p) => p?.isOwner === true,
  )

  if (!isRestaurantOwner || owned.length <= 1) return null

  const selectValue =
    scope === ANALYTICS_SCOPE_ALL
      ? ANALYTICS_SCOPE_ALL
      : scope && scope !== 'active'
        ? scope
        : activeId

  return (
    <div className="min-w-[14rem] max-w-xs">
      <div className="relative">
        <select
          id="owner-restaurant-scope"
          aria-label={t('label')}
          className={cn(selectClass, 'min-h-hisabi-btn cursor-pointer rounded-xl')}
          value={selectValue}
          onChange={(e) => {
            const next = e.target.value
            setScope(next === activeId ? 'active' : next)
          }}
        >
          <option value={ANALYTICS_SCOPE_ALL}>{t('viewAll')}</option>
          {owned.map((p) => (
            <option key={p.id} value={p.id}>
              {companyDisplayNameForLocale(p, locale) || p.id}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute end-3 top-1/2 size-5 -translate-y-1/2 text-hisabi-on-surface-variant"
          aria-hidden
        />
      </div>
    </div>
  )
}
