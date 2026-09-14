# Admin shell — sidebar + placeholder dashboard

## Summary

Replaced the temporary post-login landing (logo + “Manage menu” + logout) with a proper ADMIN app shell: fixed primary sidebar, sticky header, and a placeholder dashboard at `/`.

## Routes

| Path | Purpose |
|------|---------|
| `/` | Placeholder admin dashboard (inside shell) |
| `/menu` | Menu list (unchanged behavior; now under shell) |
| `/menu/items/new` | Create item |
| `/menu/items/[id]/edit` | Edit item |

Route group: `src/app/[locale]/(app)/` with shared layout that gates via `requireAdminAppUser()` and wraps children in `AdminAppShell`.

## UI

- `src/components/app-shell/admin-app-shell.jsx` — portal-style shell (sidebar nav: Dashboard, Menu; locale toggle; user block; logout)
- Dashboard: server page with welcome + “coming soon” overview (sales / orders / POS)
- Removed temporary `AdminAppChrome` and `temp-home-logout-button.jsx`

## i18n

- Expanded `AppShell` (nav labels, sign out, suite tagline, menu aria)
- Added `Dashboard` namespace (en/ar)
- Trimmed unused `Home` logout/openMenu keys

## Auth note

Non-ADMIN redirect in `requireAdminAppUser` now goes to `/login` (avoids a loop once `/` is the admin dashboard). Session resolution already ADMIN-only.

## Explicit QA coverage

- Authenticated ADMIN with completed onboarding → `/` shows sidebar + placeholder dashboard
- Sidebar **Menu** → `/menu` still lists items; create/edit pages keep page title + back button inside shell
- Sidebar **Dashboard** (exact) highlights only on `/`
- Mobile: hamburger opens drawer; Escape / backdrop closes
- Locale toggle in header works
- Sign out clears session and returns to login
- Unauthenticated `/` or `/menu` → login
- Incomplete business profile / ZATCA → previous onboarding gates unchanged
