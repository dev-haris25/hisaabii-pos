'use client'

import { useMemo } from 'react'
import {
  AbilityProvider as CaslAbilityProvider,
  Can,
  useAbility,
} from '@casl/react'
import { createMongoAbility } from '@casl/ability'

export { Can }

/**
 * @param {{ rules?: Array<Record<string, unknown>>, children: import('react').ReactNode }} props
 */
export function AbilityProvider({ rules = [], children }) {
  const rulesKey = JSON.stringify(rules ?? [])
  const ability = useMemo(
    () => createMongoAbility(rules ?? []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rulesKey],
  )

  return (
    <CaslAbilityProvider value={ability}>{children}</CaslAbilityProvider>
  )
}

export function useAppAbility() {
  return useAbility()
}

/** Alias for sidebar and other in-shell consumers. */
export function useOptionalAppAbility() {
  return useAbility()
}
