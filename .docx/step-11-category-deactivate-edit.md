# Category deactivate confirm + edit modal

## Summary

- Deactivating a category opens a confirm dialog.
- **Deactivate category only** — items stay sellable (keep `categoryId`).
- **Deactivate category and N items** — optional cascade when `activeItemCount > 0`.
- Actions column: **Edit** (pencil) opens bilingual edit modal; Power still toggles active.

## API

`DELETE /api/auth/menu/categories/[id]?deactivateItems=true` optionally sets matching active items to `active: false` in a transaction.

List/GET responses include `activeItemCount` (via groupBy / count).

## UI

- `menu-category-deactivate-dialog.jsx`
- `menu-category-edit-modal.jsx` (two-way Gemini translate + PATCH)
