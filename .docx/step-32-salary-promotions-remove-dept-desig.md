# Step 32 — Remove dept/designation; salary-only promotions; nationality flags

## Changes

1. **Removed** Department and Designation models, APIs, sidebar entries, and employee fields.
2. **Added** `EmployeePromotion` (salary-only): new salary required, effective month, notes; apply-due on employee list/detail; Promote sheet on list + detail; history table.
3. **Salary cap** uses `getEffectiveSalary` from promotion history for the pay period.
4. **Nationality** uses `FlagCountrySelect` + `GET /api/auth/countries` (`world-countries`).

## Migration

`prisma/migrations/20260913150000_remove_dept_desig_add_salary_promotions`
