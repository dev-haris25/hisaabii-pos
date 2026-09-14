/**
 * @param {import('@casl/ability').MongoAbility} ability
 */
export function hasFullAccess(ability) {
  return ability.can('manage', 'all')
}
