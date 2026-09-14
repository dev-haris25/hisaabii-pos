# Step 35 — RBAC: drop BusinessProfile for Manager/Accountant + read-only Menu/HR UI

## Summary

Tightened the predefined permission matrix and hid write controls in Menu and Employees for users who only have read access.

## Seed / matrix

- **Manager**: removed BusinessProfile read; Dashboard read only (plus existing CRUD on menu, POS, invoices, HR).
- **Accountant**: removed BusinessProfile read; keeps Menu/Employee **read** (and invoice/payroll CRUD as before).
- `ensurePredefinedRolesExist` now **always** deletes + recreates `RolePermission` from the seed map so existing restaurants pick up the change on next ensure call (e.g. login/session refresh path).

## UI gating (`useAppAbility`)

- `menu-list-view.jsx` — gate Add item, bulk delete/checkboxes, edit/deactivate actions.
- `menu-categories-view.jsx` — gate add form, bulk delete/checkboxes, edit/activate/deactivate.
- `employees-list-view.jsx` — gate Add, promote/edit/delete, bulk selection; keep View.
- `employee-detail-page-client.jsx` — gate Promote + Edit.

## Rules

- Updated `rules.md` §15 for BusinessProfile owner/Admin-only, permission resync, and read-only UI expectations.
