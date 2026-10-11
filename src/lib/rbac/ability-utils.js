/**
 * @param {import('@casl/ability').MongoAbility} ability
 */
export function hasFullAccess(ability) {
  return ability.can('manage', 'all')
}

/**
 * Owner / Admin / anyone allowed to change the restaurant profile. Used by the
 * app-shell gate and post-auth landing (who is sent to ZATCA onboarding).
 * @param {import('@casl/ability').MongoAbility} ability
 */
export function abilityManagesBusiness(ability) {
  return (
    hasFullAccess(ability) ||
    ability.can('update', 'BusinessProfile') ||
    ability.can('create', 'BusinessProfile')
  )
}
