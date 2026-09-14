# Step 7 — Menu management

## Summary

ADMIN-only menu CRUD for categories and items (AR/EN names, price as string, VAT preset, category, active/sortOrder). No inventory fields. Server-side list search/filter/pagination via URL query params.

## Routes

| Path | Purpose |
|------|---------|
| `/menu` | Items list (search, active, category, pagination) |
| `/menu/items/new` | Create item |
| `/menu/items/[id]/edit` | Edit item |

Categories are managed in a modal from the list toolbar (Hisabi Products pattern).

## APIs

- `GET/POST /api/auth/menu/categories`
- `GET/PATCH/DELETE /api/auth/menu/categories/[id]` (DELETE = deactivate)
- `GET/POST /api/auth/menu/items` (GET supports `search`, `active`, `categoryId`, `page`, `limit`)
- `GET/PATCH/DELETE /api/auth/menu/items/[id]` (DELETE = deactivate)

All scoped to `session.businessProfileId`; ADMIN + completed restaurant profile required.

## Shared UI (rules #12–13)

- `ActionIconButton` / `ActionIconLink`
- `PageBackButton`
- `AdminAppChrome` (temporary until AppShell)

## i18n

- `Menu` namespace (en/ar)
- `Common.back`, `Home.openMenu`
- AuthErrors: `DUPLICATE_CATEGORY`, `INVALID_CATEGORY`, `INVALID_PRICE`

## Explicit QA coverage (no separate test-case list was provided in the prompt)

- Unauthenticated → redirect login
- Incomplete restaurant/ZATCA onboarding → post-auth landing
- Empty list / filtered empty states
- Validation: required Arabic name, price format
- Duplicate category name → 409
- Invalid category on item → 400
- Deactivate item/category (soft via `active`)
- Pagination URL params preserved on filter

## Out of scope

- Image upload, drag-reorder, AppShell sidebar, POS cart, cashier access
