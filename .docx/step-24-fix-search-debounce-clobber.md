# Step 24 — Fix debounced search dropping characters

## Problem
While typing (e.g. `Haris nadeem`), the debounce navigates with a partial query (`Haris`). When server props return, list views reset the input from the URL and wipe spaces / later characters still being typed.

## Fix
- Added `useUrlSyncedSearchInput`: only syncs URL → input on **external** URL changes (back/forward / other controls), not after our own debounced push.
- Debounce the raw input; trim only the query string value so trailing spaces stay visible.
- Applied to all URL-synced list searches: Menu, Cashiers, Invoices.

## Files
- `src/lib/list-views/use-url-synced-search-input.js` (new)
- `src/app/[locale]/(app)/menu/menu-list-view.jsx`
- `src/app/[locale]/(app)/cashiers/cashiers-list-view.jsx`
- `src/app/[locale]/(app)/invoices/invoices-list-view.jsx`
