/** Same rule as reset / change-password: digit or non-alphanumeric (non-space). */
export function hasNumberOrSpecial(value) {
  return /[0-9]/.test(value) || /[^A-Za-z0-9\s]/.test(value)
}
