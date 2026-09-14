/**
 * next-intl key under `HR` for a seeded role name.
 * @param {string} name
 * @returns {string | null}
 */
export function roleNameMessageKey(name) {
  switch (name) {
    case 'Admin':
      return 'roleNameAdmin'
    case 'Manager':
      return 'roleNameManager'
    case 'Accountant':
      return 'roleNameAccountant'
    case 'HR':
      return 'roleNameHr'
    case 'Cashier':
      return 'roleNameCashier'
    case 'Staff':
    case 'Kitchen/Staff':
      return 'roleNameStaff'
    case 'Kitchen board manager':
      return 'roleNameKitchenBoardManager'
    case 'Queue display':
      return 'roleNameQueueDisplay'
    default:
      return null
  }
}
