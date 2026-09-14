/**
 * POS has no CASL RBAC — session is ready once a user object exists.
 * @param {{ id?: string } | null | undefined} user
 */
export function isAuthUserRbacLoaded(user) {
  return Boolean(user?.id)
}
