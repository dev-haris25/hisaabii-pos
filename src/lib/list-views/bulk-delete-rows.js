import { authDelete } from '@/lib/api/auth-client'

/**
 * @param {string[]} ids
 * @param {(id: string) => string} deletePathFn
 */
export async function bulkDeleteRows(ids, deletePathFn) {
  /** @type {string[]} */
  const deleted = []
  /** @type {{ id: string, error: unknown }[]} */
  const failed = []

  for (const id of ids) {
    try {
      await authDelete(deletePathFn(id))
      deleted.push(id)
    } catch (error) {
      failed.push({ id, error })
    }
  }

  return { deleted, failed }
}
