import { jsonError } from '@/lib/api/json-response'

/**
 * @param {import('@casl/ability').MongoAbility} ability
 * @param {string} action
 * @param {string} subject
 */
export function assertCan(ability, action, subject) {
  if (ability.can(action, subject)) {
    return null
  }
  return jsonError(403, 'FORBIDDEN', 'You do not have permission to perform this action')
}

/**
 * @param {import('@casl/ability').MongoAbility} ability
 * @param {string} action
 * @param {string} subject
 */
export function canPerform(ability, action, subject) {
  return ability.can(action, subject)
}
