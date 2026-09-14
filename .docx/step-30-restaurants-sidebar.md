# Step 30 — Restaurants sidebar tab (Hisabi Companies parity)

## What was built

- Sidebar **Restaurants** group (like Hisabi Organization/Companies): list + add
- `/restaurants` list view styled like Hisabi companies list (search, activate, ZATCA status, settings)
- `/restaurants/create` inside app shell with `PageBackButton` + embedded create form (no auth chrome)

## Files

- `src/components/app-shell/admin-app-shell.jsx` — nav group
- `src/app/[locale]/(app)/restaurants/page.js`
- `src/app/[locale]/(app)/restaurants/restaurants-list-view.jsx`
- `src/app/[locale]/(app)/restaurants/create/page.js`
- `src/app/[locale]/business-profile/business-profile-view.jsx` — `embedded` prop
- `src/app/api/auth/business-profiles/route.js` — ZATCA fields on list
- `messages/en.json`, `messages/ar.json` — `Restaurants` + AppShell keys

Removed standalone `/restaurants/create` outside the app shell.
