import { jsonError } from '@/lib/api/json-response'

const MESSAGES = {
  INVALID_STOCK_ITEM: 'One or more stock items are invalid',
  INCOMPATIBLE_UNIT: 'Unit must stay in the same family (piece, mass, or volume)',
  VALIDATION_ERROR: 'Invalid input',
}

/**
 * 400 for a rejected recipe / extra ingredient row (see
 * `assertRecipeIngredients`), else null.
 *
 * @param {unknown} err
 */
export function recipeIngredientErrorResponse(err) {
  const code =
    err && typeof err === 'object' && 'code' in err ? String(err.code) : ''
  if (!(code in MESSAGES)) return null
  return jsonError(400, code, MESSAGES[/** @type {keyof typeof MESSAGES} */ (code)])
}
