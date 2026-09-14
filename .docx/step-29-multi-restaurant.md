# Step 29 — Multi-restaurant support (Hisabi-style)

## What was built

Hisabi-style multi-restaurant tenancy for hisabi-pos:

- Renamed Prisma model `Staff` → `User` (`users` table)
- Added `BusinessMembership` join table
- Added `User.activeBusinessProfileId` switch pointer
- Migrated existing rows (one membership + active pointer per user)
- Tenant resolution helpers + rewired auth gates
- Sidebar `RestaurantSwitcher` (ADMIN only)
- Add-restaurant flow at `/restaurants/create`
- Cashiers remain single-restaurant (app-enforced)

## Key files

### Schema / migration
- `prisma/schema.prisma`
- `prisma/migrations/20260912221500_add_multi_restaurant_membership/migration.sql`

### Auth / tenancy
- `src/lib/auth/auth-user-json.js`
- `src/lib/auth/accessible-business-profiles.js`
- `src/lib/auth/active-business-profile.js`
- `src/lib/auth/get-session-user.js`
- `src/lib/auth/otp.js`
- `src/lib/auth/require-invoice-restaurant.js`
- `src/lib/auth/require-pos-app-user.js`
- `src/lib/menu/require-admin-restaurant.js`

### APIs
- `src/app/api/auth/business-profiles/route.js` (list + update)
- `src/app/api/auth/business-profiles/active/route.js` (switch)
- `src/app/api/auth/business-profiles/create/route.js` (add restaurant)
- Register / cashier create now seed memberships

### UI
- `src/components/app-shell/restaurant-switcher.jsx`
- `src/components/app-shell/admin-app-shell.jsx`
- `src/app/[locale]/restaurants/create/page.js`
- `src/app/[locale]/business-profile/business-profile-view.jsx` (`mode: 'create'`)

### Rules / i18n
- `rules.md` §14 rewritten; §15 cashier single-restaurant note
- `messages/en.json`, `messages/ar.json` AppShell + BusinessProfile create strings

## Decisions

- No RBAC yet — membership carries `StaffRole` enum directly
- Cashiers: exactly one membership; no switcher
- Switch API requires ADMIN membership (not owner-only like Hisabi gap)
- `createdByStaffId` column names kept for migration stability
- Legacy `User.businessProfileId` home pointer kept; runtime uses membership + active
