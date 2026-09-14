# Step 34 — Simplify owner + Admin HR rules

## Summary

Simplified restaurant ownership and Admin assignment after step 33.

## Changes

1. **No ownership transfer** — removed `POST /api/auth/hr/transfer-ownership` and all transfer UI/copy. Owner is fixed at restaurant create/register via `ownerUserId`.
2. **Owner never in employees list** — `employeeExcludeOwnerWhere` always hides the owner’s employee row (list, detail, stats), including from the owner themselves. Removed Owner badges from HR UI.
3. **Admin like any other role** — removed `assertCanAssignRoles` / `canManageAdmins` gates. Roles GET always returns Admin for anyone who can load HR roles. Anyone with Employee create/update permission can assign Admin.

## Still true

- Owner identity → `manage`/`all`
- Admin role → `manage`/`all`
- Session still exposes `isRestaurantOwner` for display (`roleName: Owner`) and cashier-window exemptions
