# Step 48 — POS under shared `(app)` shell

## Change

- Moved `src/app/[locale]/pos/*` → `src/app/[locale]/(app)/pos/`
- Removed duplicate `pos/layout.js` (`AdminAppShell`)
- `(app)/layout.js` now uses `requireAdminAppUser` (generic shell gate); POS page still uses `requirePosAppUser`
- `AdminAppShell` applies `p-0` content padding on `/pos` (same as old POS layout `contentClassName`)
- Product tour no longer needs sessionStorage remount resume for POS

## Why

POS looked like a sidebar sibling but lived in a parallel layout tree, remounting the shell (and killing Joyride) on every Settings ↔ POS navigation.
