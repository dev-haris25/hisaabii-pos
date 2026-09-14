# Step 15 — Cashier add via modal

## Change
Removed the dedicated `/cashiers/new` page. Adding a cashier is now a modal on `/cashiers`, matching the category create/edit overlay pattern.

## Touched
- Added `src/app/[locale]/(app)/cashiers/cashier-add-modal.jsx`
- Updated `cashiers-list-view.jsx` — Add button opens modal
- Updated `admin-app-shell.jsx` — Cashiers is a single nav link (no Add sub-item)
- Deleted `cashiers/new/page.js` and `cashier-add-view.jsx`
- Updated `messages/en.json` + `ar.json`

## Behavior
1. Admin clicks **Add cashier** on the list
2. Modal: enter name → create
3. Modal shows generated login code with copy; **Add another** or **Done**
