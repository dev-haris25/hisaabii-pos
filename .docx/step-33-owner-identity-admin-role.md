# Step 33 — Owner identity + Admin role

## Summary

Restaurant **Owner** is no longer an RBAC picker role. Ownership is `BusinessProfile.ownerUserId` (exactly one). **Admin** is the seeded full-access role shown in the role picker. Owner keeps `manage`/`all` via identity; Admin gets the same ability via role.

## Behavior

- Session exposes `isRestaurantOwner`, `canManageAdmins`, `canTransferOwnership`.
- Ability: `ownerUserId` match **or** Admin role → `manage`/`all`.
- Employee list/detail: owner row hidden from non-owners; Owner badge only when visible.
- Only owner + Admin can assign/remove the Admin role.
- Only owner can `POST /api/auth/hr/transfer-ownership`.
- Register / create restaurant set `ownerUserId` and seed Admin (owner still gets an HR Employee row for owner-only visibility).
- Roles GET omits Admin unless the actor can manage admins.

## Key files

- `prisma` migrations for `ownerUserId` + Owner→Admin rename (prior turn)
- `src/lib/rbac/get-ability.js`, `load-rbac-for-user.js`, `owner-admin-gates.js`, `seed-predefined-roles.js`
- `src/lib/auth/auth-user-json.js`, `register/route.js`, `business-profiles/create/route.js`
- `src/app/api/auth/hr/employees/**`, `roles/route.js`, `transfer-ownership/route.js`
- HR list/detail UI + `messages/en.json` / `ar.json`
- `rules.md` §15 updated
