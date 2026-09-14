# Step 36 — Advance payslip category + balance recovery

## Summary

Wired Hisabi-parity advance recovery on employee balance, and seeded/protected the system **Advance** deduction payslip category.

## Changes

1. **Balance query** — `GET /api/auth/hr/employees/[id]` loads `SalarySlipLine` deductions whose category name equals `Advance` (insensitive) and passes them to `computeEmployeeBalance` (no longer `[]`).
2. **Seed / ensure** — `ensureSystemAdvancePayslipCategory` creates or restores a deduction category named `Advance` (deterministic id `payslip_cat_advance_<profileId>`). Called from restaurant role seed, payslip-categories GET, and employee detail GET.
3. **Protect** — cannot create/rename/delete Advance via payslip-category APIs (`SYSTEM_PAYSLIP_CATEGORY`). UI hides delete, locks name/type on edit, excludes from bulk select; shows a System badge.
4. **i18n** — `systemCategoryBadge`, `SYSTEM_PAYSLIP_CATEGORY`, `DUPLICATE_PAYSLIP_CATEGORY` in en/ar.

## Note for existing data

Slips that used a custom category (e.g. “advance deduction”) do **not** clear outstanding advance until the line uses the **Advance** category (edit the slip or rename that category to Advance — rename of a non-system duplicate named Advance is absorbed by ensure).
